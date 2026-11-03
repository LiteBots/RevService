'use strict';

/**
 * Działy RevSerwis — jedno źródło danych dla serwera, strony (generator)
 * i panelu RevMi. Edytuj lib/divisions.json i uruchom `npm run build`.
 */
const data = require('./divisions.json');

const DIVISIONS = data.divisions.map(d => Object.freeze({ slug: d.slug, name: d.name, icon: d.icon, group: d.group, soon: Boolean(d.soon), services: d.services }));
const SLUGS = DIVISIONS.map(d => d.slug);
const bySlug = new Map(DIVISIONS.map(d => [d.slug, d]));

const isDivision = slug => bySlug.has(String(slug || ''));
const divisionName = slug => bySlug.get(String(slug || ''))?.name || '';

module.exports = { DIVISIONS, SLUGS, GROUPS: data.groups, REDIRECTS: data.redirects, isDivision, divisionName };
