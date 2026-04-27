// Downloads HYG v3.8 star catalog and writes public/stars.json
// Run once: node tools/process-stars.mjs

import { writeFile, mkdir } from 'fs/promises';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';

const HYG_URL =
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v38.csv.gz';
const MAG_LIMIT = 8.0;

console.log('Fetching HYG v3.8 star catalog…');
const res = await fetch(HYG_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);

// Decompress the gzip stream
const nodeStream = Readable.fromWeb(res.body);
const gunzip = createGunzip();
nodeStream.pipe(gunzip);

let raw = '';
for await (const chunk of gunzip) raw += chunk;

const lines = raw.trim().split('\n');
const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));

const col = (name) => headers.indexOf(name);
const iRA  = col('ra');
const iDec = col('dec');
const iMag = col('mag');
const iCI  = col('ci'); // B-V color index

// Parallel arrays — pack easily into Float32Arrays on the client
const xs = [], ys = [], zs = [], mags = [], cis = [];

for (let i = 1; i < lines.length; i++) {
  const c = lines[i].split(',');
  const mag = parseFloat(c[iMag]);
  if (isNaN(mag) || mag > MAG_LIMIT) continue;

  const ra  = parseFloat(c[iRA]);   // hours 0–24
  const dec = parseFloat(c[iDec]);  // degrees −90 to +90
  if (isNaN(ra) || isNaN(dec)) continue;

  const raRad  = ra  * (Math.PI / 12);
  const decRad = dec * (Math.PI / 180);
  const cosDec = Math.cos(decRad);

  xs.push(parseFloat((cosDec * Math.cos(raRad)).toFixed(5)));
  ys.push(parseFloat((Math.sin(decRad)).toFixed(5)));
  zs.push(parseFloat((cosDec * Math.sin(raRad)).toFixed(5)));
  mags.push(parseFloat(mag.toFixed(2)));

  const ci = parseFloat(c[iCI]);
  cis.push(isNaN(ci) ? 0.6 : parseFloat(ci.toFixed(3)));
}

await mkdir('public', { recursive: true });
await writeFile(
  'public/stars.json',
  JSON.stringify({ x: xs, y: ys, z: zs, mag: mags, ci: cis })
);

console.log(`Done — wrote ${xs.length} stars to public/stars.json`);
