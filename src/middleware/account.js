'use strict';

/**
 * 9.0: sesja klienta (/konto) jest niezależna od sesji RevMi — trzymamy ją pod kluczem `account`,
 * więc administrator zalogowany w RevMi może w tej samej przeglądarce sprawdzić panel klienta.
 */
const { Account } = require('../models-v9');

async function loadAccount(req) {
    const id = req.session?.account?.id;
    if (!id) return null;
    const account = await Account.findById(id);
    if (!account || account.status !== 'active') {
        delete req.session.account;
        return null;
    }
    return account;
}

async function requireAccount(req, res, next) {
    try {
        const account = await loadAccount(req);
        if (!account) return res.status(401).json({ success: false, message: 'Zaloguj się do panelu klienta.' });
        req.account = account;
        next();
    } catch (error) {
        next(error);
    }
}

/** Dostęp do panelu B2B nadany przez administratora w RevMi (hotel / partner). */
const requireAccess = kind => (req, res, next) => {
    if (!req.account || !(req.account.access || []).includes(kind)) {
        return res.status(403).json({ success: false, message: 'Ten panel nie jest aktywny dla Twojego konta. Dostęp nadaje RevSerwis — napisz do nas.' });
    }
    next();
};

/** Opcjonalne konto (np. zamówienie w RevOutlet od zalogowanego klienta). */
async function optionalAccount(req, res, next) {
    try {
        req.account = await loadAccount(req);
        next();
    } catch (error) {
        next(error);
    }
}

module.exports = { requireAccount, requireAccess, optionalAccount, loadAccount };
