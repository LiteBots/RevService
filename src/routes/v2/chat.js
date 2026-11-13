'use strict';

/** RevMi 2.0.0 — czat zespołowy (C5): kanały „Cała ekipa”, oddziały, „Biuro”; zdjęcia, @wzmianki, push. */
const express = require('express');
const { Employee, Branch } = require('../../models');
const { ChatChannel, ChatMessage, ChatRead } = require('../../models-v2');
const { preparePhotos } = require('../../../lib/quote-input');
const roles = require('../../../lib/v11-input');
const push = require('../../services/push');
const notify = require('../../services/notify');
const { validateId } = require('../../middleware/auth');
const { asyncRoute, httpError, isObjectId, userKeyOf } = require('../../utils');

const router = express.Router();
const bigJson = express.json({ limit: '8mb' });

const isOfficeUser = user => roles.isOffice(user.role) || user.role === 'accountant';

function channelFilter(user) {
    const or = [{ kind: 'team' }, { kind: 'branch', branch: user.branch || null }];
    if (isOfficeUser(user)) or.push({ kind: 'office' }, { kind: 'branch' });
    return { archived: false, $or: or };
}

let ensuredAt = 0;
/** Domyślne kanały: „Cała ekipa”, „Biuro” i po jednym na oddział. */
async function ensureChannels() {
    if (Date.now() - ensuredAt < 5 * 60_000) return;
    ensuredAt = Date.now();
    if (!await ChatChannel.exists({ kind: 'team' })) await ChatChannel.create({ name: 'Cała ekipa', kind: 'team' });
    if (!await ChatChannel.exists({ kind: 'office' })) await ChatChannel.create({ name: 'Biuro', kind: 'office' });
    const branches = await Branch.find({ active: true }).select('name').lean();
    for (const b of branches) {
        if (!await ChatChannel.exists({ kind: 'branch', branch: b._id })) await ChatChannel.create({ name: `Ekipa ${b.name}`, kind: 'branch', branch: b._id });
    }
}

async function canAccess(channel, user) {
    if (!channel || channel.archived) return false;
    if (channel.kind === 'team') return true;
    if (channel.kind === 'office') return isOfficeUser(user);
    if (channel.kind === 'branch') return isOfficeUser(user) || String(channel.branch || '') === String(user.branch || '');
    return false;
}

async function memberKeys(channel) {
    if (channel.kind === 'office') {
        const people = await Employee.find({ active: true, systemRole: { $in: ['admin', 'dispatcher', 'manager', 'accountant'] } }).select('_id').lean();
        return ['admin', ...people.map(p => String(p._id))];
    }
    if (channel.kind === 'branch') {
        const people = await Employee.find({ active: true, $or: [{ branch: channel.branch }, { systemRole: { $in: ['admin', 'dispatcher'] } }] }).select('_id').lean();
        return ['admin', ...people.map(p => String(p._id))];
    }
    return notify.allKeys();
}

const msgOut = m => ({ _id: m._id, channel: m.channel, authorKey: m.authorKey, authorName: m.authorName, text: m.deletedAt ? '' : m.text, hasPhoto: !m.deletedAt && m.hasPhoto, mentions: m.mentions, deleted: Boolean(m.deletedAt), createdAt: m.createdAt });

router.get('/v2/chat/channels', asyncRoute(async (req, res) => {
    await ensureChannels();
    const key = userKeyOf(req.user);
    const channels = await ChatChannel.find(channelFilter(req.user)).sort({ kind: 1, name: 1 }).lean();
    const reads = await ChatRead.find({ userKey: key, channel: { $in: channels.map(c => c._id) } }).lean();
    const readBy = new Map(reads.map(r => [String(r.channel), r.lastReadAt]));
    const out = [];
    for (const c of channels) {
        const since = readBy.get(String(c._id)) || new Date(0);
        const unread = c.lastMessageAt && c.lastMessageAt > since ? await ChatMessage.countDocuments({ channel: c._id, createdAt: { $gt: since }, authorKey: { $ne: key }, deletedAt: null }) : 0;
        out.push({ _id: c._id, name: c.name, kind: c.kind, pinnedText: c.pinnedText, lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt, unread });
    }
    const order = { team: 0, branch: 1, office: 2, task: 3 };
    out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, 'pl'));
    res.json({ channels: out, me: key });
}));

router.post('/v2/chat/channels', asyncRoute(async (req, res) => {
    if (!roles.isOffice(req.user.role)) throw httpError(403, 'Kanał może dodać biuro');
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) throw httpError(400, 'Podaj nazwę kanału');
    const channel = await ChatChannel.create({ name, kind: req.body?.kind === 'office' ? 'office' : 'team' });
    res.status(201).json({ success: true, channel });
}));

router.put('/v2/chat/channels/:id', validateId, asyncRoute(async (req, res) => {
    const channel = await ChatChannel.findById(req.params.id);
    if (!await canAccess(channel, req.user)) throw httpError(404, 'Nie znaleziono kanału');
    if (!roles.isOffice(req.user.role)) throw httpError(403, 'Tylko biuro');
    if (req.body?.pinnedText !== undefined) channel.pinnedText = String(req.body.pinnedText || '').slice(0, 300);
    if (req.body?.name) channel.name = String(req.body.name).trim().slice(0, 60);
    if (req.body?.archived === true && !['team', 'office'].includes(channel.kind)) channel.archived = true;
    await channel.save();
    res.json({ success: true, channel });
}));

router.get('/v2/chat/channels/:id/messages', validateId, asyncRoute(async (req, res) => {
    const channel = await ChatChannel.findById(req.params.id).lean();
    if (!await canAccess(channel, req.user)) throw httpError(404, 'Nie znaleziono kanału');
    const filter = { channel: channel._id };
    const after = req.query.after ? new Date(req.query.after) : null;
    const before = req.query.before ? new Date(req.query.before) : null;
    if (after && !Number.isNaN(after.getTime())) filter.createdAt = { $gt: after };
    else if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    const list = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(after ? 200 : 60).lean();
    await ChatRead.updateOne({ channel: channel._id, userKey: userKeyOf(req.user) }, { $set: { lastReadAt: new Date() } }, { upsert: true });
    res.json({ channel: { _id: channel._id, name: channel.name, kind: channel.kind, pinnedText: channel.pinnedText }, messages: list.reverse().map(msgOut), more: !after && list.length === 60 });
}));

router.post('/v2/chat/channels/:id/messages', validateId, bigJson, asyncRoute(async (req, res) => {
    const channel = await ChatChannel.findById(req.params.id);
    if (!await canAccess(channel, req.user)) throw httpError(404, 'Nie znaleziono kanału');
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    const photoIn = req.body?.photo;
    if (!text && !photoIn) throw httpError(400, 'Napisz wiadomość');
    let photo = null;
    if (photoIn) {
        if (typeof photoIn !== 'string' || photoIn.length > 6_000_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(photoIn)) throw httpError(400, 'Nieprawidłowe zdjęcie');
        [photo] = await preparePhotos([{ data: photoIn }]);
    }
    const key = userKeyOf(req.user);
    // @wzmianki: @Imię albo @Imię Nazwisko
    const people = await Employee.find({ active: true }).select('name isOwner').lean();
    const mentions = [];
    const lower = text.toLowerCase();
    for (const p of people) {
        const first = String(p.name || '').split(' ')[0].toLowerCase();
        if (first && (lower.includes('@' + first) || lower.includes('@' + String(p.name).toLowerCase()))) mentions.push(p.isOwner ? 'admin' : String(p._id));
    }
    const msg = await ChatMessage.create({ channel: channel._id, authorKey: key, authorName: req.user.name, text, photo: photo ? { data: photo.data, contentType: photo.contentType } : undefined, hasPhoto: Boolean(photo), mentions: [...new Set(mentions)] });
    channel.lastMessageAt = msg.createdAt;
    channel.lastMessage = `${String(req.user.name).split(' ')[0]}: ${text || '📷 zdjęcie'}`.slice(0, 160);
    await channel.save();
    await ChatRead.updateOne({ channel: channel._id, userKey: key }, { $set: { lastReadAt: new Date() } }, { upsert: true });

    // Push: wzmianki jako powiadomienie, reszta kanału jako cichy push zgrupowany po kanale
    const members = (await memberKeys(channel)).filter(k => k !== key);
    const mentioned = msg.mentions.filter(k => k !== key && members.includes(k));
    if (mentioned.length) void notify.notify({ type: 'chat', title: `💬 ${req.user.name} wspomniał(a) o Tobie`, body: `#${channel.name}: ${text.slice(0, 140)}`, url: `/revmi/#/czat/${channel._id}`, recipients: mentioned });
    const rest = members.filter(k => !mentioned.includes(k));
    if (rest.length) void push.sendToUsers(rest, { type: 'chat', title: `#${channel.name}`, body: `${String(req.user.name).split(' ')[0]}: ${text.slice(0, 140) || '📷 zdjęcie'}`, url: `/revmi/#/czat/${channel._id}`, tag: `chat-${channel._id}` }).catch(() => null);

    res.status(201).json({ success: true, message: msgOut(msg) });
}));

router.get('/v2/chat/messages/:id/photo', validateId, asyncRoute(async (req, res) => {
    const msg = await ChatMessage.findById(req.params.id).select('+photo.data photo.contentType channel deletedAt').lean();
    if (!msg || msg.deletedAt || !msg.photo?.data) throw httpError(404, 'Brak zdjęcia');
    const channel = await ChatChannel.findById(msg.channel).lean();
    if (!await canAccess(channel, req.user)) throw httpError(404, 'Brak zdjęcia');
    res.setHeader('Content-Type', msg.photo.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=604800');
    res.send(Buffer.from(msg.photo.data.buffer || msg.photo.data));
}));

router.delete('/v2/chat/messages/:id', validateId, asyncRoute(async (req, res) => {
    const msg = await ChatMessage.findById(req.params.id);
    if (!msg) throw httpError(404, 'Nie znaleziono wiadomości');
    if (msg.authorKey !== userKeyOf(req.user) && !roles.isOffice(req.user.role)) throw httpError(403, 'Możesz usunąć tylko swoje wiadomości');
    msg.deletedAt = new Date();
    msg.text = '';
    msg.photo = undefined;
    msg.hasPhoto = false;
    await msg.save();
    res.json({ success: true });
}));

router.channelFilter = channelFilter;
module.exports = router;
module.exports.channelFilter = channelFilter;
