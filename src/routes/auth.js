'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { timingSafeEqual } = require('crypto');
const config = require('../config');
const { Employee } = require('../models');
const { asyncRoute } = require('../utils');
const { Settings } = require('../models');
const { verifyTotp } = require('../../lib/v11-input');
const { getSettings } = require('../services/settings');

/** 9.2: sekret 2FA dla zalogowanej tożsamości (właściciel → ustawienia, pracownik → jego rekord). */
async function totpFor(user) {
    if (user.employeeId) {
        const e = await Employee.findById(user.employeeId).select('+totpSecret totpEnabled').lean();
        return e && e.totpEnabled ? e.totpSecret : null;
    }
    const st = await Settings.findOne({ key: 'main' }).select('+ownerTotpSecret ownerTotpEnabled').lean().catch(() => null);
    return st && st.ownerTotpEnabled ? st.ownerTotpSecret : null;
}

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo prób logowania. Spróbuj za kilka minut.' }
});

const saveSession = req => new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));

function sameSecret(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && timingSafeEqual(x, y);
}

router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
    const pin = String(req.body?.pin || '');
    if (!/^\d{4,8}$/.test(pin)) {
        return res.status(400).json({ success: false, message: 'PIN musi mieć od 4 do 8 cyfr' });
    }

    let user = null;
    if (sameSecret(pin, config.adminPin)) {
        const owner = await Employee.findOne({ isOwner: true, active: true }).select('name').lean().catch(() => null);
        user = { role: 'admin', name: owner?.name || config.adminName, ownerEmployeeId: owner ? String(owner._id) : null };
    } else {
        const employees = await Employee.find({ active: true }).select('+pin +pinHash');
        for (const candidate of employees) {
            const hashMatches = candidate.pinHash && await bcrypt.compare(pin, candidate.pinHash);
            const legacyMatches = !candidate.pinHash && candidate.pin && candidate.pin === pin;
            if (hashMatches || legacyMatches) {
                if (!candidate.pinHash) {
                    candidate.pinHash = await bcrypt.hash(pin, 12);
                    candidate.pin = undefined;
                    await candidate.save();
                }
                user = { role: candidate.systemRole || 'worker', name: candidate.name, employeeId: String(candidate._id), branch: candidate.branch ? String(candidate.branch) : null };
                break;
            }
        }
    }

    if (!user) return res.status(401).json({ success: false, message: 'Nieprawidłowy PIN' });

    // 9.2: drugi krok — kod z aplikacji (Google Authenticator itp.), jeśli konto ma włączone 2FA.
    const secret = await totpFor(user).catch(() => null);
    await regenerate(req);
    if (secret) {
        req.session.user = { ...user, pending2fa: true, tries2fa: 0 };
        await saveSession(req);
        return res.json({ success: true, need2fa: true, name: user.name });
    }
    if (user.role === 'admin') {
        const settings = await getSettings().catch(() => ({}));
        if (settings.require2faForAdmins) user.must2faSetup = true;
    }
    req.session.user = user;
    await saveSession(req);
    res.json({ success: true, role: user.role, name: user.name, employeeId: user.employeeId || null, ownerEmployeeId: user.ownerEmployeeId || null, branch: user.branch || null });
}));

router.post('/login/2fa', loginLimiter, asyncRoute(async (req, res) => {
    const pending = req.session?.user;
    if (!pending || !pending.pending2fa) return res.status(401).json({ success: false, message: 'Najpierw podaj PIN' });
    const secret = await totpFor(pending);
    if (!secret || !verifyTotp(secret, req.body?.code)) {
        pending.tries2fa = (pending.tries2fa || 0) + 1;
        if (pending.tries2fa >= 5) {
            return req.session.destroy(() => res.status(401).json({ success: false, message: 'Za dużo błędnych kodów — zaloguj się ponownie PIN-em.' }));
        }
        await saveSession(req);
        return res.status(401).json({ success: false, message: 'Nieprawidłowy kod — sprawdź, czy zegar w telefonie jest aktualny.' });
    }
    const user = { ...pending };
    delete user.pending2fa;
    delete user.tries2fa;
    await regenerate(req);
    req.session.user = user;
    await saveSession(req);
    res.json({ success: true, role: user.role, name: user.name, employeeId: user.employeeId || null, ownerEmployeeId: user.ownerEmployeeId || null, branch: user.branch || null });
}));

router.get('/auth/session', (req, res) => {
    if (config.authDisabled) {
        return res.json({ authenticated: true, role: 'admin', name: config.adminName, demo: true });
    }
    const u = req.session.user;
    if (u && u.pending2fa) return res.json({ authenticated: false, need2fa: true, name: u.name });
    res.json({ authenticated: Boolean(u), ...(u || {}) });
});

router.post('/logout', (req, res, next) => {
    req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('revmi.sid');
        res.json({ success: true });
    });
});

module.exports = router;
