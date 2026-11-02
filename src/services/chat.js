'use strict';

/**
 * 9.1: czat w zleceniu — klient (panel /konto) ↔ biuro i ekipa (RevMi).
 * Liczniki nieprzeczytanych trzymamy w zleceniu (chatUnreadStaff / chatUnreadClient), żeby lista zleceń
 * nie musiała liczyć wiadomości. Klient dostaje e-mail o odpowiedzi najwyżej raz na 10 minut na zlecenie.
 */
const { Task } = require('../models');
const { TaskMessage, Account } = require('../models-v9');
const { preparePhotos } = require('../../lib/quote-input');
const portal = require('./portal');
const notify = require('./notify');

const MAIL_EVERY_MS = 10 * 60 * 1000;

const view = m => ({
    id: String(m._id),
    from: m.from,
    authorName: m.from === 'staff' ? String(m.authorName || 'RevSerwis').split(' ')[0] + (m.authorName ? ' · RevSerwis' : '') : m.authorName,
    text: m.text,
    hasPhoto: Boolean(m.hasPhoto),
    createdAt: m.createdAt
});

async function list(taskId, reader) {
    const messages = await TaskMessage.find({ task: taskId }).sort({ createdAt: 1 }).limit(500).lean();
    await Task.updateOne({ _id: taskId }, { $set: reader === 'client' ? { chatUnreadClient: 0 } : { chatUnreadStaff: 0 } });
    return messages.map(view);
}

async function post(task, { from, authorName, authorKey, text, photo }) {
    let photoDoc;
    if (photo) {
        const [p] = await preparePhotos([{ data: photo }]);
        photoDoc = p;
    }
    const msg = await TaskMessage.create({ task: task._id, from, authorName, authorKey, text, ...(photoDoc ? { photo: photoDoc, hasPhoto: true } : {}) });
    const now = new Date();
    await Task.updateOne({ _id: task._id }, { $set: { lastChatAt: now }, $inc: from === 'client' ? { chatUnreadStaff: 1 } : { chatUnreadClient: 1 } });

    const snippet = text ? text.slice(0, 140) : '📷 zdjęcie';
    if (from === 'client') {
        const recipients = [...await notify.adminKeys(), ...notify.assignedKeys(task)];
        void notify.notify({ type: 'chat', title: `💬 ${authorName}: ${task.number}`, body: snippet, url: `/revmi/#/zlecenia/${task._id}`, task, recipients });
    } else if (task.account) {
        const fresh = await Task.findById(task._id).select('chatClientMailAt account number name').lean();
        const last = fresh?.chatClientMailAt ? new Date(fresh.chatClientMailAt).getTime() : 0;
        if (Date.now() - last > MAIL_EVERY_MS) {
            const acc = await Account.findById(task.account).select('email notifyEmail status').lean();
            if (acc && acc.status === 'active' && acc.notifyEmail !== false) {
                await Task.updateOne({ _id: task._id }, { $set: { chatClientMailAt: now } });
                void portal.sendMail({ to: acc.email, subject: `Nowa wiadomość w zleceniu ${task.number} — RevSerwis`, title: 'Masz odpowiedź od RevSerwis', text: `„${snippet}”`, cta: { label: 'Odpowiedz w panelu', url: portal.accountUrl('zlecenia/' + task._id) } });
            }
        }
    }
    return view(msg);
}

async function photo(taskId, messageId) {
    const m = await TaskMessage.findOne({ _id: messageId, task: taskId }).select('+photo').lean();
    if (!m || !m.photo || !m.photo.data) return null;
    const data = m.photo.data.buffer ? Buffer.from(m.photo.data.buffer) : m.photo.data;
    return { data, contentType: m.photo.contentType || 'image/jpeg' };
}

module.exports = { list, post, photo, view };
