// Sweeps the quiz's answer space against the craving-analysis pipeline
// (buildCravingProfile / computeCravingAnalysis) added after pipeline.test.mjs
// was written. That test only asserts the dish-filter pipeline never returns
// an empty pool or a hard-filter violation; it has no coverage of the
// analysis layer (match %, archetype, dontWant, alternates) at all. This
// sweeps the same answer space and asserts the analysis output stays sane --
// no NaN/undefined leaking into user-facing strings, match % in its stated
// band, no duplicate/self-referencing alternates -- plus a handful of
// hand-picked edge-case answer combos likely to break something.
//
//   node tests/craving-analysis.test.mjs

import vm from 'node:vm';
import { readAppHtml, extractBlock, extractRange } from './extract.mjs';

const html = readAppHtml();

const source = [
  extractBlock(html, 'const questions = [', '];'),
  extractBlock(html, 'const dishes = [', '];'),
  extractBlock(html, 'function passesDietary(d) {', '}'),
  extractBlock(html, 'function getEligiblePool() {', '}'),
  extractBlock(html, 'function scorePool(pool) {', '}'),
  extractBlock(html, 'function pickDish() {', '}'),
  extractRange(
    html,
    'const RICH_TAGS',
    "const HUNGER_LABELS = { light: 'Light bite', medium: 'A proper meal', hearty: 'Big appetite, hearty meal' };"
  ),
  extractBlock(html, 'function whyTextFor(dish, richness, flavourLabel) {', '}'),
  extractBlock(html, 'function buildCravingProfile(winner, scored) {', '}'),
  extractBlock(html, 'function computeCravingAnalysis() {', '}'),
  'globalThis.questions = questions; globalThis.dishes = dishes; globalThis.pickDish = pickDish;',
  'globalThis.computeCravingAnalysis = computeCravingAnalysis;',
].join('\n\n');

function freshSandbox() {
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
  return sandbox;
}

const probe = freshSandbox();
const { questions, dishes } = probe;
const DIETARY_OPTIONS = questions.find(q => q.id === 'dietary').options.map(o => o.value).filter(v => v !== 'none');
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

// Mirrors the quiz engine's walk (pipeline.test.mjs's randomAnswers), applied
// directly onto a sandbox object rather than returning a separate struct, so
// callers can Object.assign it straight onto a fresh vm context.
function applyRandomAnswers(sandbox) {
  for (const q of questions) {
    if (q.shouldSkip && q.shouldSkip({ cravingValue: sandbox.cravingValue, desiredSize: sandbox.desiredSize })) continue;

    if (q.type === 'multi') {
      const chosen = q.options.filter(o => o.value !== 'none' && Math.random() < 0.3);
      if (q.id === 'dietary') {
        sandbox.dietaryFilters = chosen.map(o => o.value);
      } else {
        chosen.forEach(o => (o.tags || []).forEach(t => { sandbox.bag[t] = (sandbox.bag[t] || 0) + 1; }));
      }
      continue;
    }

    const opt = rand(q.options);
    (opt.tags || []).forEach(t => { sandbox.bag[t] = (sandbox.bag[t] || 0) + 1; });
    if (opt.size) sandbox.desiredSize = opt.size;
    if (q.id === 'meal') sandbox.mealTime = opt.value;
    if (q.id === 'craving') sandbox.cravingValue = opt.value;
    if (q.id === 'budget') sandbox.budgetFilter = opt.budget;
  }
}

const failures = [];
const stats = {
  matchPctCounts: {},
  alternatesLenCounts: { 0: 0, 1: 0, 2: 0 },
  archetypeCounts: {},
  richnessCounts: {},
  dontWantTexts: {},
};
const context = (sandbox) => JSON.stringify({
  meal: sandbox.mealTime, craving: sandbox.cravingValue, size: sandbox.desiredSize,
  budget: sandbox.budgetFilter, dietary: sandbox.dietaryFilters, bag: sandbox.bag,
});

const BAD_STRING = /undefined|NaN|null|\bfalse\b|\btrue\b/;

function checkAnalysis(sandbox, label) {
  const ctx = `${label} ${context(sandbox)}`;
  let result;
  try {
    result = sandbox.computeCravingAnalysis();
  } catch (e) {
    failures.push(`${ctx}: computeCravingAnalysis() threw: ${e.message}`);
    return;
  }

  const { winner, alternates, profile } = result;

  stats.matchPctCounts[profile.matchPct] = (stats.matchPctCounts[profile.matchPct] || 0) + 1;
  stats.alternatesLenCounts[alternates.length] = (stats.alternatesLenCounts[alternates.length] || 0) + 1;
  stats.archetypeCounts[profile.archetype] = (stats.archetypeCounts[profile.archetype] || 0) + 1;
  stats.richnessCounts[profile.richness] = (stats.richnessCounts[profile.richness] || 0) + 1;
  profile.dontWant.forEach(d => { stats.dontWantTexts[d] = (stats.dontWantTexts[d] || 0) + 1; });

  if (!winner || !dishes.some(d => d.name === winner.name)) {
    failures.push(`${ctx}: winner "${winner && winner.name}" is not a real dish`);
  }

  // Regression check: the archetype headline names a cuisine (e.g. "Italian
  // Comfort Seeker") that must match the dish actually being recommended --
  // it previously came from the top 5 *scored* dishes' dominant cuisine
  // instead of the winner's own, so the headline could name a different
  // cuisine than the dish shown right underneath it.
  if (winner && !profile.archetype.startsWith(winner.cuisine)) {
    failures.push(`${ctx}: archetype "${profile.archetype}" doesn't start with winner's cuisine "${winner.cuisine}"`);
  }

  if (!Number.isInteger(profile.matchPct) || profile.matchPct < 72 || profile.matchPct > 97) {
    failures.push(`${ctx}: matchPct out of band: ${profile.matchPct}`);
  }

  for (const field of ['archetype', 'summary', 'why']) {
    const v = profile[field];
    if (typeof v !== 'string' || !v.trim()) {
      failures.push(`${ctx}: profile.${field} is empty/non-string: ${JSON.stringify(v)}`);
    } else if (BAD_STRING.test(v)) {
      failures.push(`${ctx}: profile.${field} leaked a raw value: "${v}"`);
    } else if (/\s{2,}/.test(v)) {
      failures.push(`${ctx}: profile.${field} has a double space (likely an empty template segment): "${v}"`);
    }
  }

  if (!Array.isArray(profile.attrs) || profile.attrs.length !== 4) {
    failures.push(`${ctx}: expected 4 attrs, got ${profile.attrs && profile.attrs.length}`);
  } else {
    for (const a of profile.attrs) {
      if (!a.icon || !a.label || typeof a.value !== 'string' || !a.value.trim()) {
        failures.push(`${ctx}: attr "${a.label}" has an empty value: ${JSON.stringify(a)}`);
      }
    }
  }

  if (!Array.isArray(profile.dontWant) || profile.dontWant.length < 1 || profile.dontWant.length > 3) {
    failures.push(`${ctx}: dontWant length out of range: ${profile.dontWant && profile.dontWant.length}`);
  } else {
    const unique = new Set(profile.dontWant);
    if (unique.size !== profile.dontWant.length) {
      failures.push(`${ctx}: dontWant has duplicate entries: ${JSON.stringify(profile.dontWant)}`);
    }
  }

  if (!Array.isArray(alternates) || alternates.length > 2) {
    failures.push(`${ctx}: alternates length invalid: ${alternates && alternates.length}`);
  } else {
    const names = alternates.map(a => a.name);
    if (names.includes(winner.name)) {
      failures.push(`${ctx}: an alternate is the same dish as the winner ("${winner.name}")`);
    }
    if (new Set(names).size !== names.length) {
      failures.push(`${ctx}: alternates contain a duplicate: ${JSON.stringify(names)}`);
    }
    for (const n of names) {
      if (!dishes.some(d => d.name === n)) failures.push(`${ctx}: alternate "${n}" is not a real dish`);
    }
  }
}

// --- Random sweep, mirroring pipeline.test.mjs's coverage of the answer space ---
const TRIALS = 3000;
for (let i = 0; i < TRIALS; i++) {
  const sandbox = freshSandbox();
  applyRandomAnswers(sandbox);
  checkAnalysis(sandbox, `[random ${i}]`);
}

// --- Hand-picked edge cases ---

// Breakfast + "sweet" craving: the breakfast gate runs first and narrows to
// the 5 breakfast dishes, none of which are dessertHeavy, so the sweet gate's
// own narrow-or-fallback immediately falls back to that same 5-dish pool.
// Worth checking explicitly since it's the one place two hard gates compose.
{
  const sandbox = freshSandbox();
  sandbox.mealTime = 'breakfast';
  sandbox.cravingValue = 'sweet';
  sandbox.desiredSize = 'medium';
  sandbox.bag = { sweet: 1 };
  checkAnalysis(sandbox, '[edge: breakfast+sweet]');
}

// Every dietary filter stacked at once -- almost certainly unsatisfiable
// (e.g. no dish is simultaneously vegan AND gluten-free AND nut-free AND
// dairy-free AND no-cheese AND no-seafood AND no-red-meat), which should
// trigger passesDietary's "fall back to the wider pool" branch.
{
  const sandbox = freshSandbox();
  sandbox.mealTime = 'dinner';
  sandbox.cravingValue = 'savory';
  sandbox.desiredSize = 'medium';
  sandbox.dietaryFilters = [...DIETARY_OPTIONS];
  sandbox.bag = { savory: 1 };
  checkAnalysis(sandbox, '[edge: all dietary filters]');
}

// Zero-signal bag: only the unavoidable single-select answers, none of which
// touch RICH_TAGS/LIGHT_TAGS/FLAVOUR_TAGS -- occasion "normal day" (no tags),
// vibe/texture/format left empty. Exercises the richness "Balanced" tie
// (0-0) and the flavourLabel "Balanced, no strong lean" fallback together.
{
  const sandbox = freshSandbox();
  sandbox.mealTime = 'lunch';
  sandbox.cravingValue = 'crispy'; // not in RICH_TAGS, LIGHT_TAGS, or FLAVOUR_TAGS
  sandbox.desiredSize = 'medium';
  sandbox.bag = { crispy: 1 };
  checkAnalysis(sandbox, '[edge: no rich/light/flavour signal]');
}

// Budget filter narrow enough that most of the pool gets excluded (Under £10
// = budget tier 1), combined with a hearty appetite that most budget-1
// dishes don't satisfy (size mismatch), to stress the size-bonus/tagRatio
// match% math on a thin pool.
{
  const sandbox = freshSandbox();
  sandbox.mealTime = 'dinner';
  sandbox.cravingValue = 'savory';
  sandbox.desiredSize = 'hearty';
  sandbox.budgetFilter = 1;
  sandbox.bag = { savory: 1 };
  checkAnalysis(sandbox, '[edge: budget=1 + hearty]');
}

// --- Stats (printed regardless of pass/fail — useful for spotting quality
// issues that aren't outright bugs, e.g. a skewed match% distribution or an
// archetype that dominates the results). ---
function topEntries(counts, n = 10) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
}

const totalRuns = TRIALS + 4;
console.log(`\n--- stats across ${totalRuns} runs ---`);

console.log('\nalternates.length distribution:');
Object.entries(stats.alternatesLenCounts).forEach(([len, c]) => {
  console.log(`  ${len}: ${c} (${((c / totalRuns) * 100).toFixed(1)}%)`);
});

const matchPcts = Object.keys(stats.matchPctCounts).map(Number);
console.log(`\nmatch% range: ${Math.min(...matchPcts)}-${Math.max(...matchPcts)}, distinct values: ${matchPcts.length}`);
console.log('match% top 5:');
topEntries(stats.matchPctCounts, 5).forEach(([v, c]) => console.log(`  ${v}%: ${c} (${((c / totalRuns) * 100).toFixed(1)}%)`));

console.log(`\ndistinct archetypes seen: ${Object.keys(stats.archetypeCounts).length}`);
console.log('archetype top 8:');
topEntries(stats.archetypeCounts, 8).forEach(([v, c]) => console.log(`  ${((c / totalRuns) * 100).toFixed(1)}%  ${v}`));

console.log('\nrichness distribution:');
topEntries(stats.richnessCounts, 10).forEach(([v, c]) => console.log(`  ${((c / totalRuns) * 100).toFixed(1)}%  ${v}`));

console.log('\ndontWant line frequency:');
topEntries(stats.dontWantTexts, 10).forEach(([v, c]) => console.log(`  ${((c / totalRuns) * 100).toFixed(1)}%  ${v}`));

if (failures.length) {
  const unique = [...new Set(failures)];
  console.error(`\nFAIL — ${failures.length} violations (${unique.length} distinct) across ${TRIALS} random trials + 4 edge cases:`);
  unique.slice(0, 40).forEach(f => console.error(`  ${f}`));
  process.exit(1);
}

console.log(`\nPASS — craving-analysis sweep clean across ${TRIALS} random trials + 4 edge cases`);
