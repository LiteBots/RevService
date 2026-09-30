'use strict';

const { Activity } = require('../models');

function recordActivity(type, message, entityType = '', entityId = null, actorName = 'System') {
    return Activity.create({ type, message: String(message).slice(0, 500), entityType, entityId, actorName }).catch(() => null);
}

module.exports = { recordActivity };
