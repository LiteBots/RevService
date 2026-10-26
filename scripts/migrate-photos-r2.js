'use strict';
/**
 * 9.2: przenosi zdjęcia z realizacji z MongoDB do Cloudflare R2 / S3.
 * Użycie: node scripts/migrate-photos-r2.js   (wymaga MONGO_URL i zmiennych S3_*)
 * Można też kliknąć „Przenieś zdjęcia do R2” w RevMi → Integracje.
 */
const mongoose = require('mongoose');
const config = require('../src/config');
const storage = require('../src/services/storage');
const { TaskMedia } = require('../src/models');

(async () => {
    if (!storage.configured()) throw new Error('Ustaw S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
    await mongoose.connect(config.mongoUrl);
    const test = await storage.selfTest();
    if (!test.ok) throw new Error('Test R2/S3 nieudany: ' + test.error);
    const n = await storage.migrate(TaskMedia, { log: total => process.stdout.write(`\rPrzeniesiono: ${total}`) });
    console.log(`\nGotowe — przeniesiono ${n} zdjęć.`);
    await mongoose.disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
