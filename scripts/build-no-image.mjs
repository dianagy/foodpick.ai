// Derives foodpick-ai-no-image.html from foodpick-ai.html by stripping the
// photo block (CSS + markup + loadDishPhoto() + its call site). Replaces the
// old workflow of hand-running a one-off strip script every time
// foodpick-ai.html changed -- foodpick-ai.html is the only file anyone edits
// or commits; this variant is generated on demand instead.
//
//   node scripts/build-no-image.mjs                  # writes foodpick-ai-no-image.html
//   node scripts/build-no-image.mjs --check           # exits 1 if the checked-in copy (if any) would differ
//   node scripts/build-no-image.mjs -o path/to/out.html

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(root, 'foodpick-ai.html');
const html = readFileSync(srcPath, 'utf8');

const cssBlock = /\n\.dish-photo-wrap \{[\s\S]*?\n\.dish-photo\.hide \{ display: none; \}\n/;
const markupBlock = /\n\s*<div class="dish-photo-wrap"[^>]*>\s*\n\s*<img id="dishPhoto"[^>]*>\s*\n\s*<div class="dish-photo-fallback"[^>]*><\/div>\s*\n\s*<\/div>\n/;
const callSite = /\n\s*loadDishPhoto\(dish\);/;
const functionBlock = /\n\/\* -+ DISH PHOTO[\s\S]*?\nfunction loadDishPhoto\(dish\) \{[\s\S]*?\n\}\n/;

function stripOrThrow(source, pattern, label, replacement = '\n') {
  if (!pattern.test(source)) throw new Error(`build-no-image: could not find the ${label} block in foodpick-ai.html -- has its structure changed?`);
  return source.replace(pattern, replacement);
}

let out = html;
out = stripOrThrow(out, cssBlock, 'photo CSS');
out = stripOrThrow(out, markupBlock, 'photo markup');
out = stripOrThrow(out, callSite, 'loadDishPhoto() call site');
// This block's own match already spans both surrounding blank lines, unlike
// the others above -- an empty replacement (not '\n') is what leaves exactly
// one blank line before the next section, matching the rest of the file.
out = stripOrThrow(out, functionBlock, 'loadDishPhoto() function', '');

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const outFlagIdx = args.indexOf('-o');
const outPath = outFlagIdx !== -1 ? resolve(process.cwd(), args[outFlagIdx + 1]) : join(root, 'foodpick-ai-no-image.html');

if (checkMode) {
  if (!existsSync(outPath)) {
    console.log(`No existing ${outPath} to compare against -- nothing to check.`);
    process.exit(0);
  }
  const existing = readFileSync(outPath, 'utf8');
  if (existing !== out) {
    console.error(`FAIL -- ${outPath} is out of date with foodpick-ai.html. Regenerate with: node scripts/build-no-image.mjs`);
    process.exit(1);
  }
  console.log('PASS -- no-image variant matches what foodpick-ai.html would generate');
  process.exit(0);
}

writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${out.length} bytes, from ${html.length}-byte source)`);
