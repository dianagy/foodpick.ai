// Checks that every dish's pinned `photo` URL actually resolves to a live
// image. These URLs (Wikimedia Commons) were sourced and hash-constructed
// without live verification -- the sandbox this project was built in has no
// network access to upload.wikimedia.org, so this check has to run somewhere
// that does. GitHub Actions runners aren't network-restricted, so this test
// running in CI is the real verification step, not a formality.
//
//   node tests/dish-photos.test.mjs
//
// A dish with photo: null (no confident match was found) is intentionally
// skipped -- the app already falls back to the dish's emoji for those.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'foodpick-ai.html'), 'utf8');

const start = html.indexOf('const dishes = [');
const end = html.indexOf('\nconst pairings');
if (start === -1 || end === -1) throw new Error('Could not locate the dishes array in the HTML');
// eslint-disable-next-line no-eval
const dishes = eval(html.slice(start, end).replace('const dishes = ', ''));

const withPhoto = dishes.filter(d => d.photo);
const withoutPhoto = dishes.filter(d => !d.photo);

console.log(`${dishes.length} dishes, ${withPhoto.length} with a pinned photo, ${withoutPhoto.length} without (emoji fallback): ${withoutPhoto.map(d => d.name).join(', ') || 'none'}`);

const failures = [];

// Wikimedia's CDN rejects requests with no User-Agent (returns a blanket
// 400, not a per-file 404) -- Node's bare fetch() sends none by default,
// unlike a browser's <img> tag, which always does. Their user-agent policy
// asks for something identifying the app: https://meta.wikimedia.org/wiki/User-Agent_policy
const USER_AGENT = 'foodpick.ai-dish-photo-check/1.0 (https://github.com/dianagy/foodpick.ai)';

async function checkOne(dish) {
  let res;
  try {
    res = await fetch(dish.photo, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': USER_AGENT } });
  } catch (e) {
    failures.push(`${dish.name}: fetch failed -- ${e.message} (${dish.photo})`);
    return;
  }
  if (!res.ok) {
    failures.push(`${dish.name}: HTTP ${res.status} (${dish.photo})`);
    return;
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    failures.push(`${dish.name}: content-type "${contentType}" is not an image (${dish.photo})`);
    return;
  }
  const len = Number(res.headers.get('content-length') || '0');
  if (len > 0 && len < 1024) {
    failures.push(`${dish.name}: suspiciously small response (${len} bytes) -- likely a placeholder/error image (${dish.photo})`);
  }
  // Drain the body so the connection can close cleanly under concurrency.
  await res.arrayBuffer().catch(() => {});
}

// A handful of concurrent requests -- fast, and polite to Wikimedia.
const CONCURRENCY = 6;
let cursor = 0;
async function worker() {
  while (cursor < withPhoto.length) {
    const dish = withPhoto[cursor++];
    await checkOne(dish);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (failures.length) {
  console.error(`\nFAIL — ${failures.length} of ${withPhoto.length} photo URLs did not check out:`);
  failures.forEach(f => console.error(`  ${f}`));
  process.exit(1);
}

console.log(`\nPASS — all ${withPhoto.length} pinned photo URLs are live images`);
