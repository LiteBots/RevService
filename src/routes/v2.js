'use strict';

/** RevMi 2.0.0 — wszystkie trasy /api/v2/* (po requireAuth i v2Guard). */
const express = require('express');

const router = express.Router();

router.use(require('./v2/me'));
router.use(require('./v2/business'));
router.use(require('./v2/crm'));
router.use(require('./v2/packages'));
router.use(require('./v2/ops'));
router.use(require('./v2/team'));
router.use(require('./v2/chat'));
router.use(require('./v2/settings'));
router.use(require('./v2-passkeys').privateRouter);

module.exports = router;
