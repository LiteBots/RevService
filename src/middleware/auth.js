'use strict';

const config = require('../config');
const { Employee } = require('../models');
const { isObjectId } = require('../utils');

async function requireAuth(req, res, next) {
    if (config.authDisabled) {
        req.user = { role: 'admin', name: config.adminName, demo: true };
        return next();
    }
    const user = req.session?.user;
    if (!user) return res.status(401).json({ success: false, message: 'Zaloguj się ponownie' });

    try {
        if (user.employeeId) {
            const employee = await Employee.findOne({ _id: user.employeeId, active: true }).select('name systemRole');
            if (!employee) {
                return req.session.destroy(() => res.status(401).json({
                    success: false,
                    message: 'Konto pracownika jest nieaktywne. Zaloguj się ponownie'
                }));
            }
            user.role = employee.systemRole || 'worker';
            user.name = employee.name;
        }
        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
}

function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Brak uprawnień administratora' });
    }
    next();
}

function validateId(req, res, next) {
    if (!isObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: 'Nieprawidłowy identyfikator' });
    }
    next();
}

module.exports = { requireAuth, requireAdmin, validateId };
