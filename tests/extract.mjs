// Shared helper for pulling logic straight out of foodpick-ai.html at test
// runtime, so there's no second copy of the app's functions to drift.
// pipeline.test.mjs, craving-analysis.test.mjs, and dish-photos.test.mjs
// each used to hand-roll this same pair of functions.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readAppHtml() {
  return readFileSync(join(root, 'foodpick-ai.html'), 'utf8');
}

// Pulls out a top-level `const <name> = [` / `function <name>(` block by
// scanning forward to its matching closing bracket at column 0.
export function extractBlock(html, startPattern, closer) {
  const start = html.indexOf(startPattern);
  if (start === -1) throw new Error(`Could not find "${startPattern}" in the HTML`);
  const end = html.indexOf(`\n${closer}`, start);
  if (end === -1) throw new Error(`Could not find the end of "${startPattern}"`);
  return html.slice(start, end + closer.length + 1);
}

// Pulls out everything between a start pattern and the first occurrence of
// an end marker after it (inclusive of the end marker) -- for spans that
// aren't a single bracketed block.
export function extractRange(html, startPattern, endMarker) {
  const start = html.indexOf(startPattern);
  const end = html.indexOf(endMarker, start);
  if (start === -1 || end === -1) throw new Error(`Could not find range starting at "${startPattern}"`);
  return html.slice(start, end + endMarker.length);
}
