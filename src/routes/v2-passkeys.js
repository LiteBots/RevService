'use strict';

/**
 * RevMi 2.1.0 — klucze dostępu (WebAuthn): logowanie Face ID / Touch ID / Windows Hello.
 * - publicRouter (przed requireAuth): opcje i weryfikacja logowania,
 * - privateRouter (po zalogowaniu): dodanie klucza na tym urządzeniu, lista, usuwanie.
 * Klucz wymaga weryfikacji użytkownika (biometria lub kod urządzenia), więc zastępuje drugi krok 2FA.
 */
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
    generateRegistrationOptions, verifyRegistrationResponse,
    generateAuthenticationOptions, verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const config = require('../config');
const { Employee } = require('../models');
const { Passkey } = require('../models-v2');
const { deviceLabel } = require('../../lib/v2');
const { asyncRoute, httpError, userKeyOf } = require('../utils');
const { validateId } = require('../middleware/auth');
const sessions = require('../services/v2-sessions');

const RP_NAME = 'RevMi · RevSerwis';
const rpOf = req => ({ rpID: req.hostname, origin: `${req.protocol}://${req.get('host')}` });
const saveSession = req => new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));

/** Odtwarza konto z klucza tak samo jak logowanie hasłem/PIN-em (aktualna rola z bazy). */
async function userFromKey(userKey) {
    if (userKey === 'admin') {
        const owner = await Employee.findOne({ isOwner: true, active: true }).select('name').lean().catch(() => null);
        return { role: 'admin', name: owner?.name || config.adminName, ownerEmployeeId: owner ? String(owner._id) : null };
    }
    const e = await Employee.findOne({ _id: userKey, active: true }).select('name systemRole branch isOwner').lean();
    if (!e) return null;
    return e.isOwner
        ? { role: 'admin', name: e.name, ownerEmployeeId: String(e._id) }
        : { role: e.systemRole || 'worker', name: e.name, employeeId: String(e._id), branch: e.branch ? String(e.branch) : null };
}

/* ------------------------------------------------------------------ */
/* Publiczne: logowanie kluczem                                        */
/* ------------------------------------------------------------------ */

const publicRouter = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Za dużo prób logowania. Spróbuj za kilka minut.' } });

publicRouter.post('/v2/passkey/login/options', limiter, asyncRoute(async (req, res) => {
    const { rpID } = rpOf(req);
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', timeout: 60_000 });
    req.session.pkLogin = { challenge: options.challenge, at: Date.now() };
    await saveSession(req);
    res.json({ success: true, options });
}));

publicRouter.post('/v2/passkey/login/verify', limiter, asyncRoute(async (req, res) => {
    const pending = req.session?.pkLogin;
    if (!pending || Date.now() - pending.at > 5 * 60_000) throw httpError(400, 'Logowanie wygasło — spróbuj jeszcze raz');
    const response = req.body?.response;
    const key = response?.id ? await Passkey.findOne({ credentialId: String(response.id) }) : null;
    if (!key) throw httpError(401, 'Ten klucz nie jest przypisany do żadnego konta. Zaloguj się hasłem lub PIN-em i dodaj klucz w Ustawieniach.');
    const { rpID, origin } = rpOf(req);
    let verification;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: pending.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
            credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: key.counter, transports: key.transports }
        });
    } catch (error) {
        throw httpError(401, 'Nie udało się potwierdzić klucza: ' + error.message);
    }
    if (!verification.verified) throw httpError(401, 'Nie udało się potwierdzić klucza');

    const user = await userFromKey(key.userKey);
    if (!user) throw httpError(403, 'Konto jest nieaktywne');
    key.counter = verification.authenticationInfo.newCounter;
    key.lastUsedAt = new Date();
    await key.save();

    await regenerate(req);
    await sessions.register(req, user, 'passkey');
    // Klucz z weryfikacją użytkownika to logowanie dwuskładnikowe — nie wymuszamy osobnej konfiguracji TOTP.
    delete user.must2faSetup;
    req.session.user = user;
    await saveSession(req);
    res.json({ success: true, role: user.role, name: user.name, employeeId: user.employeeId || null, ownerEmployeeId: user.ownerEmployeeId || null, branch: user.branch || null });
}));

/* ------------------------------------------------------------------ */
/* Po zalogowaniu: dodawanie i zarządzanie kluczami                    */
/* ------------------------------------------------------------------ */

const privateRouter = express.Router();

privateRouter.get('/v2/passkeys', asyncRoute(async (req, res) => {
    const list = await Passkey.find({ userKey: userKeyOf(req.user) }).select('label deviceType backedUp createdAt lastUsedAt').sort({ createdAt: -1 }).lean();
    res.json({ success: true, passkeys: list });
}));

privateRouter.post('/v2/passkey/register/options', asyncRoute(async (req, res) => {
    const userKey = userKeyOf(req.user);
    const existing = await Passkey.find({ userKey }).select('credentialId transports').lean();
    if (existing.length >= 10) throw httpError(400, 'Masz już 10 kluczy — usuń nieużywany, zanim dodasz nowy');
    const { rpID } = rpOf(req);
    const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userName: req.user.name || 'RevMi',
        userDisplayName: req.user.name || 'RevMi',
        userID: new TextEncoder().encode(userKey),
        attestationType: 'none',
        excludeCredentials: existing.map(k => ({ id: k.credentialId, transports: k.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        timeout: 90_000
    });
    req.session.pkRegister = { challenge: options.challenge, at: Date.now() };
    await saveSession(req);
    res.json({ success: true, options });
}));

privateRouter.post('/v2/passkey/register/verify', asyncRoute(async (req, res) => {
    const pending = req.session?.pkRegister;
    if (!pending || Date.now() - pending.at > 5 * 60_000) throw httpError(400, 'Dodawanie klucza wygasło — spróbuj jeszcze raz');
    const { rpID, origin } = rpOf(req);
    let verification;
    try {
        verification = await verifyRegistrationResponse({
            response: req.body?.response,
            expectedChallenge: pending.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true
        });
    } catch (error) {
        throw httpError(400, 'Nie udało się dodać klucza: ' + error.message);
    }
    if (!verification.verified || !verification.registrationInfo) throw httpError(400, 'Nie udało się dodać klucza');
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    delete req.session.pkRegister;
    await saveSession(req);
    const label = String(req.body?.label || '').trim().slice(0, 120) || deviceLabel(String(req.get('user-agent') || ''));
    await Passkey.create({
        userKey: userKeyOf(req.user),
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label
    });
    res.json({ success: true, label });
}));

privateRouter.delete('/v2/passkeys/:id', validateId, asyncRoute(async (req, res) => {
    const r = await Passkey.deleteOne({ _id: req.params.id, userKey: userKeyOf(req.user) });
    if (!r.deletedCount) throw httpError(404, 'Nie znaleziono klucza');
    res.json({ success: true });
}));

module.exports = { publicRouter, privateRouter, userFromKey };
