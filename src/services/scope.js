'use strict';

/**
 * 8.0: kto co widzi.
 * - Administrator: wszystko.
 * - Pracownik oddziału: tylko zlecenia swojego oddziału (Task.branch = jego oddział).
 * - Pracownik bez oddziału (ekipa główna): tylko zlecenia bez oddziału.
 * Pracownicy nie widzą surowych zgłoszeń z formularza (status „new”) ani niezaakceptowanych wycen („quoted”).
 * Właściciel (główny PIN) ma w bazie rekord pracownika (isOwner) — dzięki temu można go dopisać do zlecenia,
 * oddziału i rozliczeń.
 */
const { Employee } = require('../models');

const WORKER_STATUSES = ['planned', 'progress', 'completed', 'cancelled'];

let ownerCache = { id: null, at: 0 };

async function ownerId() {
    if (ownerCache.id && Date.now() - ownerCache.at < 60_000) return ownerCache.id;
    try {
        const o = await Employee.findOne({ isOwner: true, active: true }).select('_id').lean();
        ownerCache = { id: o ? String(o._id) : null, at: Date.now() };
    } catch { /* bez bazy (testy) */ }
    return ownerCache.id;
}
function resetOwnerCache() { ownerCache = { id: null, at: 0 }; }

/** Id pracownika „ja” — dla właściciela to rekord isOwner. */
const selfId = user => (user?.employeeId ? String(user.employeeId) : user?.ownerEmployeeId ? String(user.ownerEmployeeId) : null);

function taskFilterFor(user) {
    if (!user || user.role === 'admin') return {};
    return { status: { $in: WORKER_STATUSES }, branch: user.branch || null };
}

function canSeeTask(task, user) {
    if (!user || user.role === 'admin') return true;
    if (!WORKER_STATUSES.includes(task.status)) return false;
    return String(task.branch || '') === String(user.branch || '');
}

module.exports = { ownerId, resetOwnerCache, selfId, taskFilterFor, canSeeTask, WORKER_STATUSES };
