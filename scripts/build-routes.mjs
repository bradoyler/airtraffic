// Reduce OpenFlights airports.dat + routes.dat to a compact routes.json
// covering nonstop flights within the contiguous United States.
//
// Usage: node scripts/build-routes.mjs <airports.dat> <routes.dat> [out.json]
// Source: https://github.com/jpatokal/openflights/tree/master/data

import { readFile, writeFile } from 'node:fs/promises';

const [airportsPath, routesPath, outPath = 'data/routes.json'] = process.argv.slice(2);
if (!airportsPath || !routesPath) {
  console.error('usage: node scripts/build-routes.mjs <airports.dat> <routes.dat> [out.json]');
  process.exit(1);
}

// Minimal CSV parser for OpenFlights' quoted, comma-separated rows.
const parseRow = (line) => {
  const out = [];
  let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};
const rows = async (path) =>
  (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map(parseRow);

const isContiguous = (lat, lon) => lat > 24 && lat < 50 && lon > -125 && lon < -66;

const airports = new Map();
for (const [, name, city, country, iata, , lat, lon, , tz] of await rows(airportsPath)) {
  const la = +lat, lo = +lon;
  if (country !== 'United States' || !/^[A-Z]{3}$/.test(iata) || !isContiguous(la, lo)) continue;
  // Missing timezones ("\N") default to Eastern.
  const offset = tz !== '' && Number.isFinite(+tz) ? +tz : -5;
  airports.set(iata, { code: iata, name, city, lat: +la.toFixed(4), lon: +lo.toFixed(4), tz: offset });
}

// Count distinct operating airlines per directed airport pair.
const pairs = new Map();
for (const [airline, , src, , dst, , codeshare, stops] of await rows(routesPath)) {
  if (codeshare === 'Y' || stops !== '0' || src === dst) continue;
  if (!airports.has(src) || !airports.has(dst)) continue;
  const key = `${src}-${dst}`;
  (pairs.get(key) ?? pairs.set(key, new Set()).get(key)).add(airline);
}

const used = [...new Set([...pairs.keys()].flatMap((k) => k.split('-')))].sort();
const index = new Map(used.map((code, i) => [code, i]));
const routes = [...pairs].map(([key, airlines]) => {
  const [src, dst] = key.split('-');
  return [index.get(src), index.get(dst), airlines.size];
});

const out = { airports: used.map((c) => airports.get(c)), routes };
await writeFile(outPath, JSON.stringify(out));
console.log(`${out.airports.length} airports, ${routes.length} routes -> ${outPath}`);
