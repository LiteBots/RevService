'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { timingSafeEqual } = require('crypto');
const config = require('../config');
const { Employee } = require('../models');
const { asyncRoute } = require('../utils');

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
        user = { role: 'admin', name: config.adminName };
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
                user = { role: candidate.systemRole || 'worker', name: candidate.name, employeeId: String(candidate._id) };
                break;
            }
        }
    }

    if (!user) return res.status(401).json({ success: false, message: 'Nieprawidłowy PIN' });

    await regenerate(req);
    req.session.user = user;
    await saveSession(req);
    res.json({ success: true, role: user.role, name: user.name, employeeId: user.employeeId || null });
}));

router.get('/auth/session', (req, res) => {
    if (config.authDisabled) {
        return res.json({ authenticated: true, role: 'admin', name: config.adminName, demo: true });
    }
    res.json({ authenticated: Boolean(req.session.user), ...(req.session.user || {}) });
});

router.post('/logout', (req, res, next) => {
    req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie('revmi.sid');
        res.json({ success: true });
    });
});

module.exports = router;
