// Checks that every dish's pinned `photo` URL actually resolves to a live
// image. These URLs (Wikimedia Commons originals) were sourced and
// hash-constructed without live verification -- the sandbox this project was
// built in has no network access to upload.wikimedia.org, so this check has
// to run somewhere that does. GitHub Actions runners aren't network
// restricted, so this test running in CI is the real verification step, not
// a formality.
//
//   node tests/dish-photos.test.mjs
//
// A dish with photo: null (no confident match was found) is intentionally
// skipped -- the app already falls back to the dish's emoji for those.
//
// These are full-size originals, not /thumb/ transforms: an earlier version
// pointed at Wikimedia's thumbnail endpoint (".../thumb/h1/h2/file/600px-file")
// to keep the download small, but that endpoint returned a blanket HTTP 400
// for every single dish regardless of filename, while the plain file-serving
// URL for the same files mostly returned 200. Since `.dish-photo-wrap` already
// applies `object-fit: cover` at a fixed display size, an oversized source
// image costs load time, not correctness -- not worth chasing whatever the
// thumbnail endpoint wants that the sandbox that built this couldn't observe.
//
// A run reporting some HTTP 429s here isn't necessarily a bad URL: GitHub
// Actions runners share IP ranges across a huge number of unrelated jobs,
// and Wikimedia rate-limits by IP, so a burst of runner-originated requests
// can get throttled even at low concurrency and one request per dish. A
// real user's browser, on their own residential/mobile IP, doesn't share
// that reputation. Treat a 429 here as inconclusive for that URL, not
// confirmation it's broken -- an HTTP 400/404/415 or a non-image
// content-type is the real signal to go re-source that dish's photo.

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
// 400) -- Node's bare fetch() sends none by default, unlike a browser's
// <img> tag, which always does. Their user-agent policy asks for something
// identifying the app: https://meta.wikimedia.org/wiki/User-Agent_policy
const USER_AGENT = 'foodpick.ai-dish-photo-check/1.0 (https://github.com/dianagy/foodpick.ai)';

async function checkOne(dish) {
  let res;
  try {
    res = await fetch(dish.photo, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': USER_AGENT } });
    await res.arrayBuffer().catch(() => {});
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
}

// A handful of concurrent requests -- fast, and polite to Wikimedia. Lower
// than it might need to be: an earlier diagnostic run that fired two
// requests per dish (thumb + full-size fallback) at this same concurrency
// drew some HTTP 429s partway through, so staying modest here now that it's
// back to one request per dish.
const CONCURRENCY = 4;
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
