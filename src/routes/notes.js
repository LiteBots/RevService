'use strict';

/**
 * Notatnik RevMi — notatki zapisywane w MongoDB (kolekcja padnotes).
 * Prywatne widzi tylko autor, „zespołowe” — wszyscy zalogowani.
 */
const express = require('express');
const { PadNote, NOTE_COLORS } = require('../models');
const { validateId } = require('../middleware/auth');
const { asyncRoute, httpError, userKeyOf, isObjectId, escapeRegex } = require('../utils');
const { isDivision } = require('../../lib/divisions');

const router = express.Router();

const visibleFilter = user => ({ $or: [{ ownerKey: userKeyOf(user) }, { visibility: 'team' }] });
const canEdit = (note, user) => note.ownerKey === userKeyOf(user) || note.visibility === 'team';
const canDelete = (note, user) => note.ownerKey === userKeyOf(user) || user.role === 'admin';

function payload(body = {}) {
    const data = {};
    if (body.title !== undefined) data.title = String(body.title || '').slice(0, 160);
    if (body.content !== undefined) data.content = String(body.content || '').slice(0, 20000);
    if (body.color !== undefined) data.color = NOTE_COLORS.includes(body.color) ? body.color : 'default';
    if (body.pinned !== undefined) data.pinned = Boolean(body.pinned);
    if (body.archived !== undefined) data.archived = Boolean(body.archived);
    if (body.visibility !== undefined) data.visibility = body.visibility === 'team' ? 'team' : 'private';
    if (body.tags !== undefined) {
        const raw = Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',');
        data.tags = [...new Set(raw.map(t => String(t).trim().replace(/^#/, '').slice(0, 40)).filter(Boolean))].slice(0, 12);
    }
    if (body.checklist !== undefined) {
        data.checklist = (Array.isArray(body.checklist) ? body.checklist : []).slice(0, 100)
            .map(item => (typeof item === 'string' ? { text: item } : item))
            .filter(item => item && String(item.text || '').trim())
            .map(item => ({ ...(isObjectId(item._id) ? { _id: item._id } : {}), text: String(item.text).trim().slice(0, 300), done: Boolean(item.done) }));
    }
    if (body.task !== undefined) data.task = isObjectId(body.task) ? body.task : null;
    if (body.client !== undefined) data.client = isObjectId(body.client) ? body.client : null;
    if (body.division !== undefined) data.division = isDivision(body.division) ? body.division : '';
    if (body.reminderAt !== undefined) {
        const date = body.reminderAt ? new Date(body.reminderAt) : null;
        if (date && Number.isNaN(date.getTime())) throw httpError(400, 'Nieprawidłowa data przypomnienia');
        data.reminderAt = date;
        data.reminderSentAt = null;
    }
    return data;
}

async function load(req) {
    const note = await PadNote.findById(req.params.id);
    if (!note || !(note.ownerKey === userKeyOf(req.user) || note.visibility === 'team')) throw httpError(404, 'Nie znaleziono notatki');
    return note;
}

router.get('/notes', asyncRoute(async (req, res) => {
    const filter = { ...visibleFilter(req.user), archived: req.query.archived === '1' };
    if (req.query.task && isObjectId(req.query.task)) filter.task = req.query.task;
    if (req.query.q) {
        const q = escapeRegex(String(req.query.q).slice(0, 100));
        filter.$and = [{ $or: [{ title: { $regex: q, $options: 'i' } }, { content: { $regex: q, $options: 'i' } }, { tags: { $regex: q, $options: 'i' } }, { 'checklist.text': { $regex: q, $options: 'i' } }] }];
    }
    const notes = await PadNote.find(filter).sort({ pinned: -1, updatedAt: -1 }).limit(500).lean();
    const key = userKeyOf(req.user);
    res.json({ notes: notes.map(n => ({ ...n, mine: n.ownerKey === key })) });
}));

router.post('/notes', asyncRoute(async (req, res) => {
    const data = payload(req.body);
    if (!data.title && !data.content && !(data.checklist || []).length) throw httpError(400, 'Notatka jest pusta');
    const note = await PadNote.create({ ...data, ownerKey: userKeyOf(req.user), ownerName: req.user.name, lastEditedBy: req.user.name });
    res.status(201).json({ success: true, note: { ...note.toObject(), mine: true } });
}));

router.put('/notes/:id', validateId, asyncRoute(async (req, res) => {
    const note = await load(req);
    if (!canEdit(note, req.user)) throw httpError(403, 'Brak uprawnień do edycji');
    const data = payload(req.body);
    // Tylko autor może zmienić notatkę prywatną ↔ zespołową.
    if (data.visibility !== undefined && note.ownerKey !== userKeyOf(req.user)) delete data.visibility;
    // Ta sama data przypomnienia — nie wysyłaj go ponownie.
    if (data.reminderAt !== undefined && String(data.reminderAt?.getTime?.() ?? null) === String(note.reminderAt?.getTime?.() ?? null)) {
        delete data.reminderAt;
        delete data.reminderSentAt;
    }
    Object.assign(note, data, { lastEditedBy: req.user.name });
    await note.save();
    res.json({ success: true, note: { ...note.toObject(), mine: note.ownerKey === userKeyOf(req.user) } });
}));

router.patch('/notes/:id/checklist/:itemId', validateId, asyncRoute(async (req, res) => {
    const note = await load(req);
    const item = note.checklist.id(req.params.itemId);
    if (!item) throw httpError(404, 'Nie znaleziono pozycji');
    item.done = req.body?.done !== undefined ? Boolean(req.body.done) : !item.done;
    note.lastEditedBy = req.user.name;
    await note.save();
    res.json({ success: true, note: { ...note.toObject(), mine: note.ownerKey === userKeyOf(req.user) } });
}));

router.delete('/notes/:id', validateId, asyncRoute(async (req, res) => {
    const note = await load(req);
    if (!canDelete(note, req.user)) throw httpError(403, 'Notatkę zespołową może usunąć autor lub administrator');
    await note.deleteOne();
    res.json({ success: true });
}));

module.exports = router;
module.exports._internal = { payload, canEdit, canDelete };
