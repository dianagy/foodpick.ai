// Sweeps the quiz's answer space and asserts the pickDish() filter pipeline
// never returns an empty pool or a dish violating a stated hard filter
// (breakfast gate, sweet/dessert gate, dietary deal-breakers).
//
//   node tests/pipeline.test.mjs
//
// The dish database and pipeline functions are extracted from the real
// foodpick-ai.html at runtime, so there is no second copy to drift.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'foodpick-ai.html'), 'utf8');

// Pull out a top-level `const <name> = [` / `function <name>(` block by
// scanning forward to its matching closing bracket at column 0.
function extractBlock(startPattern, closer) {
  const start = html.indexOf(startPattern);
  if (start === -1) throw new Error(`Could not find "${startPattern}" in the HTML`);
  const end = html.indexOf(`\n${closer}`, start);
  if (end === -1) throw new Error(`Could not find the end of "${startPattern}"`);
  return html.slice(start, end + closer.length + 1);
}

const source = [
  extractBlock('const questions = [', '];'),
  extractBlock('const dishes = [', '];'),
  extractBlock('function passesDietary(d) {', '}'),
  extractBlock('function getEligiblePool() {', '}'),
  extractBlock('function scorePool(pool) {', '}'),
  extractBlock('function pickDish() {', '}'),
  // Lexical declarations don't attach to the vm context object on their own.
  'globalThis.questions = questions; globalThis.dishes = dishes; globalThis.pickDish = pickDish;',
].join('\n\n');

const sandbox = {
  history: [],
  bag: {},
  desiredSize: null,
  mealTime: null,
  cravingValue: null,
  budgetFilter: null,
  dietaryFilters: [],
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const { questions, dishes, pickDish } = sandbox;

const DIETARY_OPTIONS = questions
  .find(q => q.id === 'dietary')
  .options.map(o => o.value)
  .filter(v => v !== 'none');

const rand = arr => arr[Math.floor(Math.random() * arr.length)];

// Walks the real question list the way the quiz engine does — one random
// option per single question, a random subset for multi, honoring shouldSkip —
// so the sweep covers the answer space players can actually produce.
function randomAnswers() {
  const a = {
    bag: {},
    desiredSize: null,
    mealTime: null,
    cravingValue: null,
    budgetFilter: null,
    dietaryFilters: [],
  };

  for (const q of questions) {
    if (q.shouldSkip && q.shouldSkip({ cravingValue: a.cravingValue, desiredSize: a.desiredSize })) continue;

    if (q.type === 'multi') {
      const chosen = q.options.filter(o => o.value !== 'none' && Math.random() < 0.3);
      if (q.id === 'dietary') {
        a.dietaryFilters = chosen.map(o => o.value);
      } else {
        chosen.forEach(o => (o.tags || []).forEach(t => { a.bag[t] = (a.bag[t] || 0) + 1; }));
      }
      continue;
    }

    const opt = rand(q.options);
    (opt.tags || []).forEach(t => { a.bag[t] = (a.bag[t] || 0) + 1; });
    if (opt.size) a.desiredSize = opt.size;
    if (q.id === 'meal') a.mealTime = opt.value;
    if (q.id === 'craving') a.cravingValue = opt.value;
    if (q.id === 'budget') a.budgetFilter = opt.budget;
  }

  return a;
}

// Mirrors passesDietary's contract, asserted independently of its implementation.
const DIETARY_CHECKS = {
  vegetarian: d => d.dietary.vegetarian,
  vegan: d => d.dietary.vegan,
  dairyFree: d => d.dietary.dairyFree,
  glutenFree: d => d.dietary.glutenFree,
  nutFree: d => d.dietary.nutFree,
  noCheese: d => !d.contains_cheese,
  noSeafood: d => !d.dietary.seafood,
  noRedMeat: d => !d.dietary.redMeat,
};

// The gates in HANDOFF section 4.2 are hard filters that fall back to the
// wider pool when nothing satisfies them, so each stage is "narrow if
// possible, otherwise keep what you had". Expressed independently here so a
// reordering or a dropped fallback in pickDish() shows up as a failure.
const narrow = (pool, pred) => {
  const next = pool.filter(pred);
  return next.length ? next : pool;
};

function expectedPool(a) {
  let pool = a.mealTime === 'breakfast'
    ? narrow(dishes, d => d.breakfast)
    : dishes.filter(d => !d.breakfast);

  pool = a.cravingValue === 'sweet'
    ? narrow(pool, d => d.dessertHeavy)
    : pool.filter(d => !d.dessertHeavy);

  pool = narrow(pool, d => a.dietaryFilters.every(f => DIETARY_CHECKS[f](d)));

  if (a.budgetFilter) pool = narrow(pool, d => d.budget <= a.budgetFilter);

  return pool;
}

const TRIALS = 5000;
const failures = [];
const wins = {};

for (let i = 0; i < TRIALS; i++) {
  const answers = randomAnswers();
  Object.assign(sandbox, answers);

  const dish = pickDish();
  const context = JSON.stringify({
    meal: answers.mealTime,
    craving: answers.cravingValue,
    budget: answers.budgetFilter,
    dietary: answers.dietaryFilters,
  });

  const expected = expectedPool(answers);
  if (!expected.length) {
    failures.push(`pipeline leaves an empty pool for ${context}`);
    continue;
  }
  if (!dish) {
    failures.push(`no dish returned for ${context}`);
    continue;
  }

  wins[dish.name] = (wins[dish.name] || 0) + 1;

  if (!expected.includes(dish)) {
    failures.push(`"${dish.name}" is outside the eligible pool for ${context}`);
  }
}

const ranked = Object.entries(wins).sort((a, b) => b[1] - a[1]);
const [topName, topCount] = ranked[0];
const topShare = (topCount / TRIALS) * 100;

console.log(`${TRIALS} trials across ${dishes.length} dishes`);
console.log(`distinct winners: ${ranked.length}/${dishes.length}`);
console.log('top 5:');
ranked.slice(0, 5).forEach(([n, c]) => console.log(`  ${((c / TRIALS) * 100).toFixed(1)}%  ${n}`));

// A dish that never wins across the whole answer space is unreachable — either
// its tags match nothing or a filter permanently excludes it.
const unreachable = dishes.filter(d => !wins[d.name]).map(d => d.name);
if (unreachable.length) {
  failures.push(`unreachable dishes: ${unreachable.join(', ')}`);
}

// Coarse dominance guard. Note this does NOT specifically detect the
// unnormalized-scoring bug from HANDOFF 4.4 — on the current 28-dish database
// removing the normalization keeps the top share in the same ~15-18% band, so
// this only catches a dish that has become outright dominant.
if (topShare > 30) {
  failures.push(`"${topName}" wins ${topShare.toFixed(1)}% of trials — one dish dominates the distribution`);
}

if (failures.length) {
  const unique = [...new Set(failures)];
  console.error(`\nFAIL — ${failures.length} violations (${unique.length} distinct):`);
  unique.slice(0, 20).forEach(f => console.error(`  ${f}`));
  process.exit(1);
}

console.log('\nPASS — no empty pools and no hard-filter violations');
