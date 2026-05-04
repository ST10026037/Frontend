/**
 * Writes env-config.js for Vercel builds and local `npm run build`.
 * Priority: process.env.CLAIMLY_API_ORIGIN, then frontend/.env
 */
const fs = require('fs');
const path = require('path');

function readOriginFromDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*CLAIMLY_API_ORIGIN\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
    }
  } catch (_) {
    /* no .env */
  }
  return '';
}

const origin = (process.env.CLAIMLY_API_ORIGIN || readOriginFromDotEnv() || '').trim();
if (!origin) {
  console.error(
    'Missing CLAIMLY_API_ORIGIN. Either:\n' +
      '  • Create frontend/.env with CLAIMLY_API_ORIGIN=https://your-api.example.com\n' +
      '  • Or run: CLAIMLY_API_ORIGIN=https://... npm run build\n' +
      '  • On Vercel: set CLAIMLY_API_ORIGIN in Environment Variables'
  );
  process.exit(1);
}

const clean = String(origin).trim().replace(/\/$/, '');
const outPath = path.join(__dirname, '..', 'env-config.js');
const body =
  `/** Generated at build — do not edit */\nwindow.__CLAIMLY_API_ORIGIN__=${JSON.stringify(clean)};\n`;
fs.writeFileSync(outPath, body, 'utf8');
console.log('Wrote env-config.js for', clean);
