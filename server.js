'use strict';

const config = require('./src/config');
const { mongoose, Task, Expense, Income } = require('./src/models');
const { createApp } = require('./src/app');

/** Jednorazowe poprawki starszych danych (bezpieczne do wielokrotnego uruchamiania). */
async function migrate() {
    await Promise.all([
        Expense.updateMany({ date: { $exists: false } }, [{ $set: { date: '$createdAt' } }]),
        Income.updateMany({ date: { $exists: false } }, [{ $set: { date: '$createdAt' } }]),
        Task.updateMany({ dateStart: { $type: 'string' } }, [{
            $set: { dateStart: { $convert: { input: '$dateStart', to: 'date', onError: '$createdAt', onNull: '$createdAt' } } }
        }]),
        Task.updateMany({ dateEnd: { $type: 'string' } }, [{
            $set: { dateEnd: { $convert: { input: '$dateEnd', to: 'date', onError: null, onNull: null } } }
        }]),
        Task.updateMany({ completed: true, completedAt: null }, [{ $set: { completedAt: '$createdAt', status: 'completed' } }]),
        Task.updateMany({ completed: { $ne: true }, status: { $exists: false } }, { $set: { status: 'planned' } }),
        // Zlecenia już po terminie nie powinny dostać zaległych przypomnień po wdrożeniu.
        Task.updateMany(
            { dateStart: { $lt: new Date() }, 'reminders.secondSentAt': { $exists: false } },
            { $set: { 'reminders.firstSentAt': new Date(), 'reminders.secondSentAt': new Date() } }
        )
    ]);
}

async function start() {
    const MongoStore = require('connect-mongo');
    await mongoose.connect(config.mongoUrl);
    console.log('[RevMi] Połączono z MongoDB');
    await migrate();

    const sessionStore = MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: 'sessions',
        ttl: 60 * 60 * 24 * 30
    });
    const app = createApp({ sessionStore });

    try {
        await require('./src/services/push').initPush();
        console.log('[RevMi] Powiadomienia push gotowe');
    } catch (error) {
        console.error('[RevMi] Nie udało się przygotować powiadomień push:', error.message);
    }

    require('./src/services/discord').startDiscordQueue();
    if (config.schedulerEnabled) {
        require('./src/services/reminders').startReminderScheduler({ intervalMs: config.schedulerIntervalMs });
        console.log('[RevMi] Harmonogram przypomnień uruchomiony');
    }

    const server = app.listen(config.port, () => {
        console.log(`[RevMi] Działa na porcie ${config.port}${config.authDisabled ? ' (logowanie wyłączone!)' : ''}`);
    });

    const shutdown = async signal => {
        console.log(`[RevMi] ${signal}: zamykanie…`);
        server.close();
        await mongoose.disconnect().catch(() => null);
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
    start().catch(error => {
        console.error('[RevMi] Nie udało się uruchomić:', error);
        process.exit(1);
    });
}

module.exports = { start, migrate };
