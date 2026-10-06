'use strict';

const config = require('../config');
const { Settings, PushSubscription } = require('../models');

let webpush = null;
let vapidPublicKey = '';
let ready = null;

function lib() {
    if (!webpush) webpush = require('web-push');
    return webpush;
}

/**
 * Klucze VAPID: najpierw zmienne środowiskowe, potem baza danych.
 * Jeśli nigdzie ich nie ma, generujemy parę i zapisujemy w MongoDB,
 * dzięki czemu subskrypcje przeżywają kolejne wdrożenia na Railway.
 */
async function initPush() {
    if (ready) return ready;
    ready = (async () => {
        let { publicKey, privateKey } = config.vapid;
        if (!publicKey || !privateKey) {
            const stored = await Settings.findOne({ key: 'main' }).select('+vapidPublicKey +vapidPrivateKey').lean();
            if (stored?.vapidPublicKey && stored?.vapidPrivateKey) {
                publicKey = stored.vapidPublicKey;
                privateKey = stored.vapidPrivateKey;
            } else {
                const keys = lib().generateVAPIDKeys();
                publicKey = keys.publicKey;
                privateKey = keys.privateKey;
                await Settings.findOneAndUpdate(
                    { key: 'main' },
                    { $set: { vapidPublicKey: publicKey, vapidPrivateKey: privateKey } },
                    { upsert: true, setDefaultsOnInsert: true }
                );
                console.log('[RevMi] Wygenerowano i zapisano klucze VAPID dla powiadomień push.');
            }
        }
        lib().setVapidDetails(config.vapid.subject, publicKey, privateKey);
        vapidPublicKey = publicKey;
        return publicKey;
    })().catch(error => {
        ready = null;
        throw error;
    });
    return ready;
}

async function getPublicKey() {
    return vapidPublicKey || initPush();
}

/**
 * Wysyła powiadomienie do wszystkich urządzeń wskazanych użytkowników.
 * payload: { title, body, url, tag, type }
 */
async function sendToUsers(userKeys, payload) {
    const keys = [...new Set((userKeys || []).map(String))];
    if (!keys.length) return { sent: 0, failed: 0 };
    await initPush();

    const subscriptions = await PushSubscription.find({ userKey: { $in: keys } }).lean();
    const body = JSON.stringify({
        title: payload.title,
        body: payload.body || '',
        url: payload.url || '/revmi/',
        tag: payload.tag || payload.type || 'revmi',
        type: payload.type || 'info',
        icon: '/revmi/icons/icon-192.png',
        badge: '/revmi/icons/badge-96.png',
        timestamp: Date.now()
    });

    let sent = 0;
    let failed = 0;
    await Promise.all(subscriptions.map(async sub => {
        try {
            await lib().sendNotification(
                { endpoint: sub.endpoint, keys: sub.keys },
                body,
                { TTL: 60 * 60 * 24, urgency: payload.urgency || 'high', topic: (payload.tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined }
            );
            sent++;
            await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastSuccessAt: new Date(), failures: 0 } });
        } catch (error) {
            failed++;
            if (error.statusCode === 404 || error.statusCode === 410) {
                await PushSubscription.deleteOne({ _id: sub._id });
            } else {
                const updated = await PushSubscription.findOneAndUpdate({ _id: sub._id }, { $inc: { failures: 1 } }, { new: true });
                if (updated && updated.failures >= 15) await PushSubscription.deleteOne({ _id: sub._id });
                console.error('[RevMi] Push nie został dostarczony:', error.statusCode || error.message);
            }
        }
    }));
    return { sent, failed };
}

module.exports = { initPush, getPublicKey, sendToUsers };
