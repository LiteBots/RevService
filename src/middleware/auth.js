'use strict';

const config = require('../config');
const { Employee } = require('../models');
const { isObjectId } = require('../utils');
const roles = require('../../lib/v11-input');

async function requireAuth(req, res, next) {
    if (config.authDisabled) {
        req.user = { role: 'admin', name: config.adminName, demo: true };
        return next();
    }
    const user = req.session?.user;
    if (!user) return res.status(401).json({ success: false, message: 'Zaloguj się ponownie' });
    if (user.pending2fa) return res.status(401).json({ success: false, need2fa: true, message: 'Podaj kod z aplikacji uwierzytelniającej' });

    try {
        if (user.employeeId) {
            const employee = await Employee.findOne({ _id: user.employeeId, active: true }).select('name systemRole branch');
            if (!employee) {
                return req.session.destroy(() => res.status(401).json({
                    success: false,
                    message: 'Konto pracownika jest nieaktywne. Zaloguj się ponownie'
                }));
            }
            user.role = employee.systemRole || 'worker';
            user.name = employee.name;
            user.branch = employee.branch ? String(employee.branch) : null;
        } else if (user.role === 'admin' && !user.ownerEmployeeId) {
            // Sesje sprzed 8.0: dopinamy rekord właściciela (żeby „mój plan” i przypisania działały).
            user.ownerEmployeeId = await require('../services/scope').ownerId();
        }
        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

/** Pełna ścieżka API bez prefiksu /api (działa też w router.use('/v9', …), gdzie req.path jest przycięte). */
const apiPath = req => String(req.originalUrl || req.url || '').split('?')[0].replace(/^\/api(?=\/|$)/, '') || '/';

/**
 * 9.2: „administracyjne” trasy są dostępne dla administratora oraz dla ról biurowych,
 * którym tabela uprawnień (lib/v11-input.js → ROUTE_PERMS) daje dostęp do danej ścieżki.
 * Trasy nieopisane w tabeli zostają tylko dla administratora.
 */
function requireAdmin(req, res, next) {
    const role = req.user?.role;
    if (role === 'admin') return next();
    if (role && roles.permits(role, req.method, apiPath(req))) return next();
    return res.status(403).json({ success: false, message: role && role !== 'worker' ? `Rola „${roles.ROLE_LABELS[role] || role}” nie ma dostępu do tej funkcji` : 'Brak uprawnień administratora' });
}

/** Tylko właściciel / administrator — bez wyjątków dla innych ról. */
function requireOwnerAdmin(req, res, next) {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, message: 'Tylko administrator' });
    next();
}

/** Wymaga konkretnego uprawnienia (np. „finance”, „dispatch”). */
const requirePerm = perm => (req, res, next) => (roles.can(req.user?.role, perm, req.method)
    ? next()
    : res.status(403).json({ success: false, message: 'Brak uprawnień do tej funkcji' }));

function validateId(req, res, next) {
    if (!isObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Nieprawidłowy identyfikator' });
    }
    next();
}

module.exports = { requireAuth, requireAdmin, requireOwnerAdmin, requirePerm, apiPath, validateId };
