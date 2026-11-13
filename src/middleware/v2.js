'use strict';

/**
 * RevMi 2.0.0 — po requireAuth:
 * - „ostatnio aktywny” w liście urządzeń,
 * - administrator bez 2FA może tylko skonfigurować 2FA (i się wylogować), dopóki go nie włączy.
 */
const { touch } = require('../services/v2-sessions');
const { apiPath } = require('./auth');

const ALLOWED_WITHOUT_2FA = [/^\/auth\/session$/, /^\/logout$/, /^\/v92\/2fa(\/(setup|enable))?$/, /^\/v2\/me$/, /^\/push\/public-key$/];

function v2Guard(req, res, next) {
    if (req.user?.demo) return next();
    void touch(req);
    const user = req.session?.user;
    if (user?.must2faSetup && user.role === 'admin') {
        const path = apiPath(req);
        if (!ALLOWED_WITHOUT_2FA.some(re => re.test(path))) {
            return res.status(403).json({ success: false, need2faSetup: true, message: 'Konto administratora wymaga włączenia logowania dwuetapowego (2FA).' });
        }
    }
    next();
}

module.exports = { v2Guard };
