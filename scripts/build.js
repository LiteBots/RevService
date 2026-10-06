'use strict';

// Krok build na Railway. Żaden etap nie blokuje wdrożenia — w repozytorium
// są już gotowe pliki CSS i ikony, więc build jedynie je odświeża.
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (label, cmd, args) => {
    const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) console.warn(`[build] ${label}: pominięto (kod ${result.status}). Używam plików z repozytorium.`);
};

run('Działy', process.execPath, ['scripts/build-divisions.js']);
run('Klasy CSS', process.execPath, ['scripts/build-utilities.js']);
run('Ikony PWA', process.execPath, ['scripts/generate-icons.js']);
