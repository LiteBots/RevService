'use strict';

/**
 * 9.0: konto klienta — rejestracja e-mail + hasło, logowanie, wylogowanie, weryfikacja e-maila, reset hasła.
 * Trasy publiczne (przed requireAuth RevMi). Prefiks: /api/konto
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { Account } = require('../models-v9');
const P = require('../../lib/portal-input');
const portal = require('../services/portal');
const { loadAccount } = require('../middleware/account');
const { asyncRoute, httpError } = require('../utils');
const { recordActivity } = require('../services/activity');

const router = express.Router();

const limiter = (limit, minutes = 15) => rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Za dużo prób. Spróbuj ponownie za kilka minut.' }
});

const LOCK_AFTER = 8;
const LOCK_MINUTES = 15;
// Hash „na niby” — porównanie trwa tyle samo, gdy konta nie ma (nie zdradzamy, czy e-mail istnieje).
const DUMMY_HASH = bcrypt.hashSync('revserwis-dummy-password', 12);

const save = req => new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));

/** Nowa sesja (ochrona przed przejęciem), z zachowaniem ewentualnego logowania do RevMi. */
function startSession(req, account, remember) {
    return new Promise((resolve, reject) => {
        const revmiUser = req.session.user;
        req.session.regenerate(err => {
            if (err) return reject(err);
            if (revmiUser) req.session.user = revmiUser;
            req.session.account = { id: String(account._id) };
            if (!remember) req.session.cookie.maxAge = 1000 * 60 * 60 * 12;
            req.session.save(e => (e ? reject(e) : resolve()));
        });
    });
}

/** Dane konta widoczne dla samego klienta. */
function me(account) {
    return {
        id: String(account._id),
        email: account.email,
        name: account.name,
        phone: account.phone,
        kind: account.kind,
        company: account.company,
        nip: account.nip,
        address: account.address,
        city: account.city,
        postalCode: account.postalCode,
        invoiceEmail: account.invoiceEmail,
        access: account.access || [],
        accessRequested: (account.accessRequested || []).filter(k => !(account.access || []).includes(k)),
        partner: (account.access || []).includes('partner') ? { agencyName: account.partner?.agencyName || account.company, commissionPct: account.partner?.commissionPct ?? 10 } : null,
        hotel: (account.access || []).includes('hotel') ? { companyName: account.hotel?.companyName || account.company } : null,
        emailVerified: Boolean(account.emailVerified),
        notifyEmail: account.notifyEmail !== false,
        notifySms: account.notifySms !== false,
        marketingConsent: Boolean(account.marketingConsent),
        deletionRequestedAt: account.deletionRequestedAt || null,
        createdAt: account.createdAt
    };
}

router.get('/konto/me', asyncRoute(async (req, res) => {
    const account = await loadAccount(req);
    if (!account) return res.json({ authenticated: false });
    res.json({ authenticated: true, account: me(account) });
}));

router.post('/konto/register', limiter(8, 60), asyncRoute(async (req, res) => {
    const data = P.validateRegister(req.body);
    if (await Account.exists({ email: data.email })) {
        throw httpError(409, 'Konto z tym adresem e-mail już istnieje. Zaloguj się albo zresetuj hasło.');
    }
    const verify = portal.createToken(48);
    let account;
    try {
        account = await Account.create({
            email: data.email,
            passwordHash: await bcrypt.hash(data.password, 12),
            name: data.name,
            phone: data.phone,
            kind: data.kind,
            company: data.company,
            nip: data.nip,
            marketingConsent: data.marketingConsent,
            accessRequested: data.accessRequested,
            verifyTokenHash: verify.hash,
            verifyTokenExpires: verify.expires,
            termsAcceptedAt: new Date(),
            lastLoginAt: new Date(),
            loginCount: 1
        });
    } catch (error) {
        if (error.code === 11000) throw httpError(409, 'Konto z tym adresem e-mail już istnieje.');
        throw error;
    }
    await startSession(req, account, true);
    res.status(201).json({ success: true, account: me(account), verificationSent: require('../services/mail').isConfigured() });

    void portal.ensureClient(account);
    if (account.marketingConsent) void require('../services/newsletter').syncAccount(account);
    void portal.sendVerification(account, verify.token);
    void recordActivity('account_created', `Nowe konto klienta: ${account.name} (${account.email})`, 'Account', account._id, 'Panel klienta');
    const wants = data.accessRequested.map(k => (k === 'hotel' ? 'panel hotelu' : 'portal partnera')).join(', ');
    void portal.notifyAdmins({ type: 'account', title: wants ? `🏢 Nowe konto — prosi o ${wants}` : '👤 Nowe konto klienta', body: `${account.name}${account.company ? ' · ' + account.company : ''} · ${account.email}`, url: '/revmi/#/konta', dedupeKey: `account:${account._id}` });
}));

router.post('/konto/login', limiter(20), asyncRoute(async (req, res) => {
    const data = P.validateLogin(req.body);
    const account = await Account.findOne({ email: data.email }).select('+passwordHash +failedLogins +lockedUntil');
    if (account?.lockedUntil && account.lockedUntil > new Date()) {
        throw httpError(429, `Konto chwilowo zablokowane po wielu nieudanych próbach. Spróbuj za ${LOCK_MINUTES} minut albo zresetuj hasło.`);
    }
    const ok = await bcrypt.compare(data.password, account?.passwordHash || DUMMY_HASH);
    if (!account || !ok) {
        if (account) {
            const failed = (account.failedLogins || 0) + 1;
            await Account.updateOne({ _id: account._id }, {
                $set: { failedLogins: failed >= LOCK_AFTER ? 0 : failed, ...(failed >= LOCK_AFTER ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : {}) }
            });
        }
        throw httpError(401, 'Nieprawidłowy e-mail lub hasło.');
    }
    if (account.status !== 'active') throw httpError(403, 'Konto jest zablokowane. Skontaktuj się z RevSerwis.');
    await Account.updateOne({ _id: account._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }, $inc: { loginCount: 1 } });
    await startSession(req, account, data.remember);
    res.json({ success: true, account: me(account) });
}));

router.post('/konto/logout', asyncRoute(async (req, res) => {
    delete req.session.account;
    await save(req);
    res.json({ success: true });
}));

router.post('/konto/verify', limiter(20), asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '');
    if (!/^[a-f0-9]{64}$/.test(token)) throw httpError(400, 'Nieprawidłowy link weryfikacyjny.');
    const account = await Account.findOne({ verifyTokenHash: portal.hashToken(token) }).select('+verifyTokenExpires');
    if (!account || !account.verifyTokenExpires || account.verifyTokenExpires < new Date()) {
        throw httpError(400, 'Link wygasł albo został już użyty. Zaloguj się i wyślij go ponownie.');
    }
    await Account.updateOne({ _id: account._id }, { $set: { emailVerified: true, emailVerifiedAt: new Date() }, $unset: { verifyTokenHash: 1, verifyTokenExpires: 1 } });
    // Potwierdzony e-mail konta = potwierdzona zgoda na newsletter (jeśli ją zaznaczono)
    if (account.marketingConsent) void require('../services/newsletter').syncAccount({ ...account.toObject(), emailVerified: true });
    res.json({ success: true, message: 'Adres e-mail potwierdzony. Zlecenia zgłoszone na ten adres są teraz widoczne w panelu.' });
}));

router.post('/konto/verify/resend', limiter(5, 60), asyncRoute(async (req, res) => {
    const account = await loadAccount(req);
    if (!account) throw httpError(401, 'Zaloguj się do panelu klienta.');
    if (account.emailVerified) return res.json({ success: true, message: 'E-mail jest już potwierdzony.' });
    const verify = portal.createToken(48);
    await Account.updateOne({ _id: account._id }, { $set: { verifyTokenHash: verify.hash, verifyTokenExpires: verify.expires } });
    const sent = await portal.sendVerification(account, verify.token);
    res.json({ success: true, message: sent ? 'Wysłaliśmy nowy link na ' + account.email : 'Wysyłka e-maili jest chwilowo niedostępna — zadzwoń, a potwierdzimy konto ręcznie.' });
}));

router.post('/konto/forgot', limiter(5, 60), asyncRoute(async (req, res) => {
    const email = P.email(req.body?.email);
    const account = await Account.findOne({ email, status: 'active' });
    if (account) {
        const reset = portal.createToken(1);
        await Account.updateOne({ _id: account._id }, { $set: { resetTokenHash: reset.hash, resetTokenExpires: reset.expires } });
        void portal.sendReset(account, reset.token);
    }
    // Zawsze ta sama odpowiedź — nie zdradzamy, czy konto istnieje.
    res.json({ success: true, message: 'Jeśli konto istnieje, wysłaliśmy link do zmiany hasła. Sprawdź skrzynkę (także spam).' });
}));

router.post('/konto/reset', limiter(10, 60), asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '');
    if (!/^[a-f0-9]{64}$/.test(token)) throw httpError(400, 'Nieprawidłowy link.');
    const password = P.password(req.body?.password, 'Nowe hasło');
    const account = await Account.findOne({ resetTokenHash: portal.hashToken(token), status: 'active' }).select('+resetTokenExpires');
    if (!account || !account.resetTokenExpires || account.resetTokenExpires < new Date()) throw httpError(400, 'Link wygasł. Poproś o nowy.');
    await Account.updateOne({ _id: account._id }, {
        $set: { passwordHash: await bcrypt.hash(password, 12), failedLogins: 0, lockedUntil: null, emailVerified: true, emailVerifiedAt: account.emailVerifiedAt || new Date() },
        $unset: { resetTokenHash: 1, resetTokenExpires: 1 }
    });
    await startSession(req, account, true);
    res.json({ success: true, account: me(await Account.findById(account._id)) });
}));

module.exports = router;
module.exports._internal = { me };
