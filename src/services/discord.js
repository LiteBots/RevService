'use strict';

const https = require('https');
const config = require('../config');
const { Task, Message } = require('../models');

function send(content) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            content,
            allowed_mentions: { parse: [], users: [config.discordMentionId] }
        });
        const request = https.request(config.discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, response => {
            response.resume();
            response.on('end', () => (response.statusCode >= 200 && response.statusCode < 300
                ? resolve()
                : reject(new Error('Discord HTTP ' + response.statusCode))));
            response.on('error', reject);
        });
        request.setTimeout(10_000, () => request.destroy(new Error('Discord timeout')));
        request.on('error', reject);
        request.end(payload);
    });
}

let busy = false;

/** Kolejka powiadomień Discord (z ponawianiem) — tak jak w poprzedniej wersji. */
async function flushDiscord() {
    if (!config.discordWebhookUrl || busy || Task.db.readyState !== 1) return;
    busy = true;
    try {
        const task = await Task.findOneAndUpdate(
            { discordPending: true, discordNextAttempt: { $lte: new Date() } },
            { $set: { discordNextAttempt: new Date(Date.now() + 60_000) } },
            { new: true }
        );
        if (task) {
            await send(`<@${config.discordMentionId}> Wpadła nowa wycena: **${task.type || 'zapytanie'}** (${task.number})`);
            await Task.updateOne({ _id: task._id }, { $set: { discordPending: false } });
        }
        const message = await Message.findOneAndUpdate(
            { discordPending: true, discordNextAttempt: { $lte: new Date() } },
            { $set: { discordNextAttempt: new Date(Date.now() + 60_000) } },
            { new: true }
        );
        if (message) {
            const who = message.kind === 'company' && message.company ? `${message.company} (${message.name})` : message.name;
            await send(`<@${config.discordMentionId}> Nowa wiadomość z formularza kontaktowego: **${message.topic}** — ${who}`);
            await Message.updateOne({ _id: message._id }, { $set: { discordPending: false } });
        }
    } catch (error) {
        console.error('[RevMi] Powiadomienie Discord nie zostało wysłane; ponowienie za minutę.');
    } finally {
        busy = false;
    }
}

function startDiscordQueue() {
    const timer = setInterval(flushDiscord, 5_000);
    timer.unref();
    return timer;
}

module.exports = { flushDiscord, startDiscordQueue };
