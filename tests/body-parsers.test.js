'use strict';

// Regresja (9.2): app.js pomija domyślny parser JSON dla tras ze zdjęciami (bigBody).
// Każda taka trasa MUSI mieć własny parser — inaczej req.body jest puste
// (tak było z /tasks/:id/media i /tasks/:id/complete: nie dało się zakończyć zlecenia).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const routes = fs.readdirSync(path.join(root, 'src/routes')).map(f => fs.readFileSync(path.join(root, 'src/routes', f), 'utf8')).join('\n');

test('każda trasa pominięta przez domyślny parser JSON ma własny parser', () => {
    const m = app.match(/const bigBody = (\/.*\/i);/);
    assert.ok(m, 'nie znaleziono bigBody w app.js');
    const bigBody = eval(m[1]); // eslint-disable-line no-eval
    const id = 'a'.repeat(24);
    const lines = routes.split('\n').filter(l => /router\.post\('\//.test(l) || /\b\w+\.post\('\//.test(l));
    let checked = 0;
    for (const line of lines) {
        const p = line.match(/\.post\('([^']+)'/)[1];
        const sample = '/api' + p.replace(/:id|:\w+/g, id);
        if (!bigBody.test(sample)) continue;
        checked++;
        assert.ok(/express\.json\(|bigJson|Json\b/.test(line), `Trasa POST ${p} nie ma własnego parsera JSON`);
    }
    assert.ok(checked >= 8, `sprawdzono tylko ${checked} tras`);
});
