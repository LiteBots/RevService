'use strict';

/**
 * RevMi 2.0.0 — rejestr zalogowanych urządzeń: lista sesji, zdalne wylogowanie, alert o nowym urządzeniu,
 * wymóg 2FA dla administratorów.
 */
const { createHash } = require('crypto');
const { LoginSession } = require('../models-v2');
const { Employee, Settings } = require('../models');
const { deviceLabel } = require('../../lib/v2');
const { userKeyOf } = require('../utils');

const adminTwoFactorOptional = () => String(process.env.ADMIN_2FA_OPTIONAL || '').toLowerCase() === 'true';

/** Czy konto ma włączone 2FA (właściciel → ustawienia, pracownik → jego rekord). */
async function hasTotp(user) {
    if (user.employeeId) {
        const e = await Employee.findById(user.employeeId).select('totpEnabled').lean();
        return Boolean(e?.totpEnabled);
    }
    const s = await Settings.findOne({ key: 'main' }).select('ownerTotpEnabled').lean();
    return Boolean(s?.ownerTotpEnabled);
}

/**
 * Wywoływane po każdym udanym logowaniu (PIN, hasło, kod 2FA). Zapisuje urządzenie, ustawia wymóg konfiguracji 2FA
 * dla administratora bez 2FA i wysyła alert, gdy to pierwsze logowanie z tego urządzenia.
 */
async function register(req, user, method) {
    try {
        if (user.role === 'admin' && !adminTwoFactorOptional() && !(await hasTotp(user))) {
            user.must2faSetup = true;
        }
        const key = userKeyOf(user);
        const ua = String(req.get('user-agent') || '').slice(0, 400);
        const device = deviceLabel(ua);
        const deviceHash = createHash('sha256').update(key + '|' + ua).digest('hex').slice(0, 32);
        const [seen, any] = await Promise.all([
            LoginSession.exists({ userKey: key, deviceHash }),
            LoginSession.exists({ userKey: key })
        ]);
        await LoginSession.updateOne(
            { sid: req.sessionID },
            { $set: { userKey: key, name: user.name, role: user.role, device, deviceHash, userAgent: ua, ip: String(req.ip || '').slice(0, 60), method, lastSeenAt: new Date() } },
            { upsert: true }
        );
        if (!seen && any) {
            const { getV2 } = require('./v2-config');
            const cfg = await getV2().catch(() => ({ newDeviceAlerts: true }));
            if (cfg.newDeviceAlerts) {
                const notify = require('./notify');
                const recipients = [key, ...(user.role === 'admin' ? await notify.adminKeys() : [])];
                void notify.notify({
                    type: 'security',
                    title: '🔐 Logowanie z nowego urządzenia',
                    body: `${user.name}: ${device}. Jeśli to nie Ty — wyloguj to urządzenie w Ustawieniach → Bezpieczeństwo.`,
                    url: '/revmi/#/ustawienia/bezpieczenstwo',
                    recipients: [...new Set(recipients)]
                });
            }
        }
    } catch (error) {
        console.error('[RevMi 2.0] Rejestr sesji:', error.message);
    }
}

/** Odświeża „ostatnio aktywny” najwyżej co 5 minut. */
async function touch(req) {
    const s = req.session;
    if (!s || !req.sessionID) return;
    const now = Date.now();
    if (s.v2SeenAt && now - s.v2SeenAt < 5 * 60_000) return;
    s.v2SeenAt = now;
    LoginSession.updateOne({ sid: req.sessionID }, { $set: { lastSeenAt: new Date() } }).catch(() => null);
}

/** Wylogowuje sesję z magazynu sesji (connect-mongo / pamięć w testach). */
function destroySid(store, sid) {
    return new Promise(resolve => {
        if (!store || typeof store.destroy !== 'function') return resolve(false);
        store.destroy(sid, () => resolve(true));
    });
}

module.exports = { register, touch, destroySid, hasTotp, adminTwoFactorOptional };
