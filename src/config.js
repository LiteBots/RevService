'use strict';

// Czas w logice przypomnień i statystyk liczony jest w strefie firmy.
if (!process.env.TZ) process.env.TZ = 'Europe/Warsaw';

const bool = (value, fallback = false) =>
    value === undefined || value === '' ? fallback : String(value).toLowerCase() === 'true';

const list = value =>
    String(value || '')
        .split(',')
        .map(item => item.trim().replace(/\/$/, ''))
        .filter(Boolean);

const config = {
    port: Number(process.env.PORT) || 3000,
    mongoUrl: process.env.MONGO_URL || process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/revmi',
    adminPin: String(process.env.ADMIN_PIN || '1234'),
    adminName: process.env.ADMIN_NAME || 'Gracjan Błachnio',
    sessionSecret: process.env.SESSION_SECRET || 'revmi-dev-secret-change-me-immediately',
    authDisabled: bool(process.env.AUTH_DISABLED),
    isProduction: process.env.NODE_ENV === 'production',
    allowedOrigins: list(process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL),
    crossSiteSession: bool(process.env.CROSS_SITE_SESSION),
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    discordMentionId: process.env.DISCORD_MENTION_ID || '913479364883136532',
    publicUrl: (process.env.PUBLIC_URL || 'https://www.revserwis.pl').replace(/\/$/, ''),
    timeZone: process.env.TZ,
    vapid: {
        publicKey: process.env.VAPID_PUBLIC_KEY || '',
        privateKey: process.env.VAPID_PRIVATE_KEY || '',
        subject: process.env.VAPID_SUBJECT || 'mailto:kontakt@revserwis.pl'
    },
    schedulerEnabled: bool(process.env.SCHEDULER_ENABLED, true),
    schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS) || 60_000
};

if (config.isProduction && config.sessionSecret.startsWith('revmi-dev-secret')) {
    console.warn('[RevMi] UWAGA: ustaw zmienną SESSION_SECRET w Railway.');
}
if (config.isProduction && config.adminPin === '1234') {
    console.warn('[RevMi] UWAGA: ustaw zmienną ADMIN_PIN w Railway (domyślny PIN 1234 jest niebezpieczny).');
}

module.exports = config;
