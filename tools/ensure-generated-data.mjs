import { access } from 'fs/promises';

const requiredFiles = [
  'public/stars.json',
  'public/zodiac.json',
];

const missingFiles = [];

for (const file of requiredFiles) {
  try {
    await access(file);
  } catch {
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  console.error('Missing generated data files:');
  for (const file of missingFiles) {
    console.error(`- ${file}`);
  }
  console.error('');
  console.error('Run `npm run setup-data` to generate them before building.');
  process.exit(1);
}

