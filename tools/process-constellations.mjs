import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 12 zodiac + 25 other constellations
const CONSTELLATIONS_TO_INCLUDE = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc', 'Ori', 'UMa', 'Dra', 'Cas', 'Her', 'Per', 'Aur', 'Cyg', 'Lyr', 'Aql', 'Cen', 'Car', 'And', 'Peg', 'Cep', 'Cet', 'Oph', 'Ser', 'Boo', 'Cor', 'CrB', 'Crv', 'Hya', 'Pyx', 'Pup', 'Mon', 'Lep', 'CMa'];

const LINES_URL = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json';
const NAMES_URL = 'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.json';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

const [linesData, namesData] = await Promise.all([fetchJson(LINES_URL), fetchJson(NAMES_URL)]);

// Build id → display name and label coords from constellations.json
const nameMap = {};
const labelCoordsMap = {};
for (const feature of namesData.features) {
  nameMap[feature.id] = feature.properties.name;
  labelCoordsMap[feature.id] = feature.geometry.coordinates; // [ra_deg, dec_deg]
}

const output = {};

for (const feature of linesData.features) {
  const id = feature.id;
  if (!CONSTELLATIONS_TO_INCLUDE.includes(id)) continue;

  // MultiLineString: array of line segments, each a [[ra,dec], ...] array
  // d3-celestial uses RA in degrees (0-360), Dec in degrees
  const lines = feature.geometry.coordinates;

  output[id] = {
    name: nameMap[id] ?? id,
    labelCoords: labelCoordsMap[id] ?? null,
    lines,
  };
}

const missing = CONSTELLATIONS_TO_INCLUDE.filter(id => !output[id]);
if (missing.length) {
  console.warn('Warning: missing constellations:', missing.join(', '));
}

const outPath = join(__dirname, '../public/zodiac.json');
writeFileSync(outPath, JSON.stringify(output));
console.log(`Wrote ${Object.keys(output).length} constellations to public/zodiac.json`);
