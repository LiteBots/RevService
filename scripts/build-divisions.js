'use strict';

// Generuje Public/assets/divisions.js (katalog działów dla strony i panelu) z lib/divisions.json.
const fs = require('fs');
const path = require('path');

const data = require('../lib/divisions.json');
const slim = {
    groups: data.groups,
    divisions: data.divisions.map(d => ({ slug: d.slug, name: d.name, icon: d.icon, group: d.group, soon: Boolean(d.soon), tagline: d.tagline, services: d.services }))
};
const out = path.join(__dirname, '..', 'Public', 'assets', 'divisions.js');
fs.writeFileSync(out, '/* Wygenerowano z lib/divisions.json — nie edytuj ręcznie (npm run build) */\nwindow.RV_DIVISIONS = ' + JSON.stringify(slim) + ';\n');
console.log('[działy] ' + slim.divisions.length + ' działów → Public/assets/divisions.js');
