# Diagnose Your Craving — Handoff Doc

**For:** picking this project up in Claude Code
**File:** `diagnose-your-craving.html` (single self-contained file — HTML/CSS/JS, no build step, no JS dependencies)
**Status:** Functional MVP, guest-only. Quiz logic and scoring are solid and covered by a test sweep. Accounts were removed in v2 — **read Section 11 first**, since Sections 2 and 6 describe the superseded account architecture and are kept only as history. Chat needs a deployed function to work.

---

## 1. Background

This started as a hobby project: a reusable "what should I order for takeout" quiz for personal/local use, with a receipt-style result screen and a "find it near me" link. It went through several distinct phases in chat, each building on the last:

1. **v1 — first draft.** A single branching quiz (mood → texture → cuisine → hunger → dessert) with a girly/neutral tone toggle, built as a Claude.ai artifact. Result screen styled as a printed thermal receipt (kept in every version since — it's the visual signature of the product).
2. **v2 — doc-driven rebuild.** The user supplied a Word doc spec with a finalized 10-question set (vibe, hunger, craving, texture, adventurousness, cuisine, budget, dietary deal-breakers, side, dessert) in £ currency. Rebuilt scoring around a dish database with hard filters (dietary, cuisine, budget) and soft tag-overlap scoring. Added persistent order history via `window.storage` (Claude-artifact-only API at this point).
3. **Standalone conversion.** User asked for the app to work outside the Claude chat window entirely. Swapped `window.storage` → `localStorage`, swapped a "paste dish into chat for Claude to map it" hack → a direct Google Maps search link. Added PWA-ish meta tags (add-to-homescreen).
4. **Account sync.** User wanted history tied to an optional account (not forced). Added Supabase: magic-link auth, `order_history` table with row-level security, guest mode as the default with an explicit opt-in to sign in. Local history migrates to the account on first sign-in.
5. **Design pass.** Added a dish photo (keyword-matched, no API key) and an embedded "nearby restaurants" map (no API key) to the result screen.
6. **v3 — full spec-driven rebuild.** User supplied a second, more detailed PDF spec (13 questions, real branching/skip logic, new dish-database fields). This was a substantial rebuild, not an incremental patch — see Section 3.
7. **Bug fix pass.** User reported the quiz kept recommending the same dish (Bibimbap) regardless of answers. Root cause and fix in Section 4.4.

**Design language throughout:** dark "neon diner at night" aesthetic (near-black background, pink/yellow/teal neon glow, Archivo Black display font), with the result screen styled as a printed monospace receipt (Courier Prime, dashed lines, perforated bottom edge, staggered "printing" animation).

---

## 2. Architecture Overview

Everything lives in one HTML file:

- **`<style>`** — all CSS, custom properties for the color palette (`--bg`, `--pink`, `--yellow`, `--teal`, `--ink`, `--muted`, `--paper`, `--paper-ink`)
- **Body** — four `.screen` divs toggled via a `.active` class: `#start`, `#quiz`, `#result`, `#history`
- **`<script>`** — one big inline script, no modules, no build step. Roughly in this order:
  1. Supabase config + client init
  2. State variables
  3. Account/auth functions
  4. History functions (localStorage or Supabase, depending on sign-in state)
  5. `questions` array (the 13-question spec)
  6. `dishes` array (28 dishes)
  7. Quiz engine (`renderQuestion`, `selectSingle`, `toggleMulti`, `advance`)
  8. Dish selection (`passesDietary`, `pickDish`)
  9. Result rendering (`showResult`, `loadDishPhoto`, `loadNearbyMap`)
  10. Init / event wiring at the bottom

External dependencies:
- Google Fonts (`Archivo Black`, `DM Sans`, `Courier Prime`) — the only third-party
  request left, and it degrades to system fonts

No npm, no bundler, no JS dependencies. Editing this file directly is the whole workflow.

> **Superseded by v2.** The script order above still lists Supabase config, auth
> functions, and dual-source history. All of that is gone — see Section 11.

---

## 3. Question Flow (13 questions, current spec)

In order, with type and any conditional skip:

| # | id | Type | Skip condition |
|---|-----------|--------|-----------------|
| 1 | `meal` | single | — |
| 2 | `occasion` | single | — |
| 3 | `vibe` | single | — |
| 4 | `hunger` | single | — |
| 5 | `craving` | single | — |
| 6 | `texture` | single | — |
| 7 | `format` | **multi** | **skipped if Q5 (craving) = "Sweet"** |
| 8 | `dietary` | **multi** | — |
| 9 | `budget` | single | — |
| 10 | `wait` | single | — |
| 11 | `method` | single | — |
| 12 | `side` | single | **skipped if Q4 (hunger) = "Snack-sized"** |
| 13 | `dessert` | single | — |

Each question object has `header: { girly, neutral }` for the tone toggle (set on the start screen, applies to every question header — option labels themselves don't change between tones, only the headers).

**Engine mechanics** (`advance()` in the script):
```js
function advance() {
  qIndex++;
  const skipState = getSkipState(); // { cravingValue, desiredSize }
  while (qIndex < questions.length && questions[qIndex].shouldSkip && questions[qIndex].shouldSkip(skipState)) {
    qIndex++;
  }
  if (qIndex < questions.length) renderQuestion(); else showResult();
}
```
Skip logic is a predicate function (`shouldSkip`) living directly on the question object, evaluated against a small state snapshot. To add a new conditional skip, add a `shouldSkip: (state) => boolean` to the target question and make sure whatever it depends on is included in `getSkipState()`.

**Multi-select questions** (`format`, `dietary`) share one generic handler (`toggleMulti` + the `continueBtn` click handler), which branches on `q.id` to decide what to do with the selections — `dietary` becomes hard filters, `format` becomes scored tags. If a third multi-select question is ever added, extend that branch rather than duplicating the toggle logic.

**Removed from the previous (10-question) version and not coming back unless re-spec'd:**
- The old "Pick a cuisine" question (was a hard filter) — cut per spec, cuisine is now just a display field on each dish.
- The old "How adventurous are you?" question and its "Surprise me" chaos-mode option (random pick, bypassing scoring) — cut per spec entirely.

---

## 4. Dish Database & Scoring

### 4.1 Dish object shape
```js
{
  name, cuisine, emoji,
  size: 'light' | 'medium' | 'hearty',
  budget: 1 | 2 | 3,              // roughly <£10 / £10–20 / £20+
  contains_cheese: bool,
  breakfast: bool,                 // optional, only on breakfast-pool dishes
  dessertHeavy: bool,               // optional, only on dessert-pool dishes
  tags: [...],                     // craving + texture + vibe/occasion + format tags, all one flat pool
  dietary: { vegetarian, vegan, dairyFree, glutenFree, nutFree, seafood, redMeat }, // booleans
  desc, query                      // query is used for both the photo keyword and the maps/search link
}
```
28 dishes total: the original 18 (spanning 9 cuisines) + 5 breakfast dishes + 5 dessert-heavy dishes, added for the v3 spec.

### 4.2 Filter/score pipeline (`pickDish()`)
Runs in this fixed order — order matters, each stage narrows the pool for the next:

1. **Breakfast gate** (first, because it changes the whole eligible pool): if Q1 = "Breakfast/brunch", filter to `d.breakfast === true` only; otherwise exclude all breakfast dishes from the pool entirely.
2. **Sweet-as-main-event gate**: if Q5 (craving) = "Sweet", filter to `d.dessertHeavy === true` only; otherwise exclude all dessert-heavy dishes. (User confirmed: **keep as hard filter**, not a soft scoring boost — see Section 6.)
3. **Dietary hard filter** (`passesDietary`): checks every selected Q8 deal-breaker against the dish's `dietary` object and `contains_cheese`. Falls back to the pre-filter pool if the combination is unsatisfiable (should be rare — a few dishes satisfy vegan+gluten-free+nut-free simultaneously).
4. **Budget soft filter**: if a budget tier was chosen (not "doesn't matter"), narrow to `d.budget <= budgetFilter`; skipped entirely if "doesn't matter" was picked.
5. **Scoring** (see 4.3) on whatever survives.

### 4.3 Scoring formula (post-fix, see 4.4)
```js
const rawTagScore = d.tags.reduce((sum, t) => sum + (bag[t] || 0), 0);
let score = d.tags.length ? rawTagScore / d.tags.length : 0;   // normalized, NOT raw sum
if (desiredSize && d.size === desiredSize) score += 0.4;
score += (dishHistCount[d.name] || 0) * 0.3;
score += (cuisineHistCount[d.cuisine] || 0) * 0.15;
```
`bag` is a running count of every tag selected across all answered questions (vibe, occasion, craving, texture, and format if asked all write into the same flat tag pool). After scoring, the winner isn't just `argmax` — all dishes within `0.001` of the top score are collected and one is picked at random, so genuine ties produce variety instead of always returning the first-indexed dish.

### 4.4 The Bibimbap bug (fixed, but worth understanding)
**Symptom:** the quiz kept recommending Bibimbap almost regardless of answers.

**Root cause:** the original scoring was an unnormalized sum — `score = sum of bag[tag] for every tag on the dish`. Bibimbap had 7 tags (`fresh, healthy, savory, crunchy, comfort, bowl, rice`) versus most other dishes' 4–5. Since it's a *sum*, not an *average*, having more tags is a structural advantage independent of relevance — Bibimbap's tags happened to span nearly every question category (vibe, craving, texture, format), so it accumulated points from almost any answer combination, correct or not. Ties also always resolved to whichever dish appeared first in the array, compounding the problem.

**Fix:** divide by tag count (average match quality instead of raw match count), and randomize among near-ties. Verified with a 5,000-trial simulation sweeping random answer combinations — Bibimbap's win rate dropped from dominant to ~1.7%, in line with the other 27 dishes.

**Lesson for future dish additions:** keep tag-array lengths roughly consistent across dishes (aim for 4–6), or the normalization will still slightly favor dishes with fewer, more targeted tags over ones with many loosely-relevant tags. If dish count grows significantly, it's worth re-running a similar simulation to sanity-check the win-rate distribution before shipping.

---

## 5. Photo & Map (result screen)

Both are **no-API-key** solutions, chosen specifically to avoid a setup step for the MVP:

- **Photo**: `loadDishPhoto(dish)` builds a query from `dish.query` (stripping " delivery near me") and requests `https://loremflickr.com/480/300/{keywords}?lock={timestamp}` — a free keyword-matched photo service. Not hand-curated, so matches are sometimes loose (e.g. a generic "chicken" photo instead of specifically Korean fried chicken). On image load failure, `onerror` swaps in the dish's emoji as a fallback so nothing ever shows a broken-image icon.
- **Map**: `loadNearbyMap(dish)` tries `navigator.geolocation.getCurrentPosition` (4s timeout); if granted, builds a query like `"{dish name} restaurants near {lat},{lng}"`, otherwise falls back to `"{dish name} restaurants near me"`. Either way it loads into an `<iframe>` via `https://maps.google.com/maps?q={query}&z=13&output=embed` — the classic no-API-key Maps embed trick.
- The **"Find it near me" button** above the map is separate and simpler: opens `https://www.google.com/maps/search/?api=1&query=...` in a new tab, which works everywhere with zero setup.

**Known limitation, not yet confirmed fixed:** both the photo and the map failed to render when tested through Claude's inline artifact preview inside this chat. Working theory: Claude's artifact sandbox only allows network requests to a small domain allowlist (Google Fonts and jsdelivr are clearly on it, since those load fine), and arbitrary third-party domains like `loremflickr.com` and the Maps embed iframe are not. This has **not been confirmed against a real browser tab** — that's the first thing to verify in Claude Code, since it runs outside that sandbox entirely.

---

## 6. Supabase Account Setup (SUPERSEDED — removed in v2, see Section 11)

> Kept for history only. Accounts, magic-link auth, and the `order_history`
> table were all removed. History is `localStorage` only and needs no setup.


Currently:
```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const SUPABASE_CONFIGURED = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
```
With placeholders in place, `SUPABASE_CONFIGURED` is `false` and the app runs in guest-only mode — no sign-in UI renders at all, history goes to `localStorage`. This is intentional graceful degradation, not a bug.

**To turn on account sync:**
1. Create a free project at supabase.com.
2. Settings → API → copy **Project URL** and **anon public** key into the two constants above.
3. Run once in the Supabase SQL Editor:
   ```sql
   create table order_history (
     id uuid primary key default gen_random_uuid(),
     user_id uuid references auth.users(id) not null,
     dish text not null,
     cuisine text not null,
     restaurant text,
     ts bigint not null
   );
   alter table order_history enable row level security;
   create policy "select own" on order_history for select using (auth.uid() = user_id);
   create policy "insert own" on order_history for insert with check (auth.uid() = user_id);
   create policy "delete own" on order_history for delete using (auth.uid() = user_id);
   ```
4. Authentication → URL Configuration → add the real hosted URL as a redirect URL. **Magic links require a real `https://` address** — they will not work against `file://` or `localhost` in most Supabase project configurations, so this step needs the app actually deployed somewhere (Netlify/GitHub Pages) before sign-in can be tested end-to-end.

**Auth flow as implemented:** email magic link only (no password). Start screen shows "👤 Browsing as guest" with a "Sign in to sync" link by default; signing in swaps the history source from `localStorage` to Supabase (scoped by `user_id` via RLS) and migrates any existing local history into the account on first sign-in (`migrateLocalHistoryIfNeeded()`). Signing out drops cleanly back to guest/local mode.

There's a `timer_create_v0` reminder that was set mid-chat for "12 hours from now" to nudge the user to actually do this setup — worth checking whether that's still relevant by the time this doc is read.

---

## 7. Known Open Items

Roughly in priority order:

1. ~~**Verify photo/map in a real browser.**~~ **Done — see Section 10.** Found and fixed a real bug in the map; the photo is still unconfirmed for a different reason.
2. **Supabase isn't configured yet** — placeholder keys still in place. Needs an actual project + the SQL above + a real hosting URL before account sync can be tested.
3. **Photo accuracy is keyword-based, not curated.** Fine for a zero-config MVP; if accuracy matters more going forward, the upgrade path is either hand-picking one stock photo URL per dish, or wiring the Unsplash API with a real key for better-targeted matches.
4. **Q10 (wait time) and Q11 (delivery/pickup) are display-only.** They're captured and shown in the receipt but don't affect scoring or filtering — the spec's database-changes section didn't request that, so it was left alone. Worth revisiting if "ASAP" should e.g. deprioritize dishes with a longer implied prep time, though there's currently no prep-time field on any dish to hang that off of.
5. **Two branching judgment calls were made without explicit spec coverage, then confirmed by the user as correct-as-built** (no code changes needed, just documenting the reasoning for whoever picks this up):
   - "Sweet" craving **hard-filters** to dessert-only dishes rather than just boosting their score.
   - Breakfast dishes are **excluded entirely** outside the "Breakfast/brunch" meal answer, rather than being eligible everywhere.
6. **Dish count is uneven across categories** — e.g. only 2 dishes per original cuisine, 5 breakfast, 5 dessert-heavy. Fine for MVP variety; if the "surprise me" feeling ever seems repetitive, that's likely why.
7. ~~**No tests.**~~ **Done — `tests/pipeline.test.mjs`, see Section 10.**

---

## 8. Lessons Learned (process notes for whoever picks this up)

- **Chat-based iterative design worked well for the question content itself** — wording, branching structure, and tone were all worked out in plain conversation before any code was written, question by question, with explicit confirmation at each step. Worth preserving that pattern for future question-set changes rather than jumping straight to code.
- **Unnormalized additive scoring is a trap.** Any "sum of matches" scoring system will implicitly favor whichever items have the most things-to-match, independent of relevance. Normalize by count (or otherwise cap/balance it) from the start next time, rather than discovering it via a user bug report.
- **Claude's in-chat artifact preview is not equivalent to a real deployed page.** Features depending on external network calls (arbitrary image CDNs, embedded iframes) may silently fail in that sandbox even when the code is correct. Anything network-dependent should be validated in an actual browser tab before being treated as "confirmed working."
- **Claude-specific APIs don't survive a move to a standalone product.** `window.storage` (artifact-only persistence) and the "paste a dish into chat and Claude looks it up" map trick both had to be replaced when the app moved from "artifact inside Claude" to "standalone product" — `localStorage`/Supabase and a no-API-key Maps embed, respectively. Worth checking early whether a proposed feature depends on the Claude chat context specifically.
- **Cutting a question means grep-ing for everything downstream of it.** When "cuisine" and "adventurousness" were cut from the question spec, their entire supporting logic (cuisine hard-filter, chaos-mode random pick) had to be found and removed too, not just the question definitions — otherwise dead code and orphaned state variables accumulate silently.
- **A user-reported "it keeps giving me the same answer" bug is usually a scoring/normalization issue, not a randomness issue** — worth reaching for a quick simulation (sweep random inputs, tally outcomes) to confirm a fix actually changes the distribution, rather than eyeballing a handful of manual runs.

---

## 9. Chat Mode (Implemented) & Agent Mode (Companion Spec, Still Future Work)

A second build brief (`Food_Craving_Takeout_Agent_Build_Brief.docx`) was handed off separately, written for a **conversational agent with live tool access**, not a static webpage. Section 9.9 below is now **implemented in-app** as a scoped-down version of that brief — a real LLM-powered chat, without the live restaurant/menu search or ordering automation. Sections 9.1–9.8 remain the original documentation-only spec for that fuller version, kept for when/if that gets built.

### 9.1 Relationship to the existing HTML app

There are now **three** ways into a recommendation, not two:

- **The button quiz**: fixed 13-question flow, deterministic local scoring against the 28-dish database, works fully offline, zero API keys required.
- **Chat mode** (implemented, Section 9.9): free-text conversation with a real LLM, backed by a Supabase Edge Function. Can recommend dishes outside the local 28 — it isn't constrained to the quiz's database.
- **Agent mode** (still just a spec, Sections 9.1–9.8): the fuller vision with live restaurant/menu verification and real tool access — not built.

If full agent mode is ever built, the cleanest path is still for it to reuse the HTML app's existing craving-inference vocabulary (the same tag system — `comfort`, `spicy`, `cheesy`, `fresh`, format tags, etc.) as its internal "what am I craving" step, with live search layered on top to verify availability — rather than three systems disagreeing with each other.

### 9.2 System / agent prompt (original full-agent version)

This is the original, fuller-scope prompt from the brief, written for an agent with live search tools. **The actually-implemented chat system prompt is different and simpler — see Section 9.9.2.** Kept here for reference if full agent mode gets built later:

> You are a food-craving and takeout decision agent for Diagnose Your Craving. Help people who don't know what they want to eat. Ask concise, playful questions and infer their strongest craving from mood, appetite, weather, dietary restrictions, budget, location, and desired effort — the same signal categories the quiz uses (vibe, occasion, craving, texture, format, dietary deal-breakers, budget). Narrow to 2–4 specific dishes, not an overwhelming list. When real food is requested, search current nearby restaurants and menus and recommend dishes that are actually available there. **Never invent restaurants, dishes, menus, prices, ratings, availability, or ordering links** — if you can't verify it, say so rather than guessing.



### 9.3 Craving inference modes

These didn't get added to the static quiz (see reasoning above — they need free-text interpretation, not a new button question) but are natural for an agent to pick up on unprompted:

- **Hot-weather mode**: if the person mentions heat, prioritize refreshing/light/cold/hydrating options unless they explicitly ask for comfort food. Maps to dishes tagged `fresh`/`light` in the existing database (Poke-equivalents, Falafel & Hummus, Sushi, Bibimbap).
- **Hungover/nauseous mode**: prioritize gentle foods (broth, rice, toast, simple noodles, plain carbs). Maps loosely to `comfort`/`soft`/`slurpable` tags (Ramen's broth, Chana Masala, Congee-style dishes if ever added). **Keep health guidance cautious and non-diagnostic** — this lines up with Claude's existing behavior around not diagnosing conditions and flagging when something sounds like it needs real medical attention rather than a food recommendation.
- **Tie-breaker**: if the person is genuinely stuck between options, ask exactly one sensory question (e.g., "creamy/rich, fresh/tangy, crispy/salty, or spicy/punchy?") and use the answer to pick a winner. This is naturally suited to conversation in a way the button quiz isn't, since the button quiz never reaches an "undecided" state — it always terminates with one answer.

### 9.4 Local restaurant search & menu matching

The brief's "suggested tool architecture" maps directly onto tools already available in this environment:

| Brief's role | Concrete implementation |
|---|---|
| Location | `user_location_v0` (precise, for "near me" queries) |
| Restaurant search | `places_search` |
| Menu/web browser | `web_fetch` on the restaurant's site or delivery-platform listing, to verify current dishes |
| Ranking | Score by exact dish match first, then dietary fit, distance, price, quality — same priority order the brief specifies |
| Session state | Whatever's carrying the quiz answers forward (chat context, or the HTML app's `bag`/state if ever bridged) |
| Confirmation gate | **Scoped out — see 9.5** |

**Menu matching guardrail** (kept close to the brief's original wording since it's specific and good): search for the closest *exact* matches to the inferred dish — e.g., for creamy tomato pasta with olives, search for puttanesca, tomato/olive/caper dishes, Norma, or similarly-described Mediterranean pasta — rather than substituting an unrelated dish just because a restaurant has a high rating. Never invent menu items, prices, ratings, or availability; if a dish can't be verified on a current menu, say so rather than recommending it.

### 9.5 Ordering — explicitly scoped down

Decision made this round: **ordering means linking out to the restaurant/delivery platform's page — nothing more.** The brief's original "open the ordering flow, verify modifiers, require confirmation immediately before purchase" describes real purchase automation, which this project has never implemented and isn't taking on now. This mirrors exactly what the HTML app already does today (the "Find it near me" button and the Google Maps deep link) — a real agent version of this should do the same: search, verify, recommend, then hand the person a real link and stop. If purchase automation is ever revisited, the brief's confirmation-gate language is a reasonable starting point, but that's a future decision, not a current one.

### 9.6 Guardrails (adapted)

- Never invent restaurants, dishes, menus, prices, ratings, availability, or delivery times — verify via live search/fetch before stating anything as fact.
- Prefer a verified menu match over a generic recommendation, even if the generic one is a "safer" guess.
- Treat location as sensitive, consistent with using `precise` accuracy only when proximity actually matters.
- No purchase automation (per 9.5) — link out only, never imply or claim a purchase is complete.
- Hungover/nauseous mode gives food suggestions, not medical guidance — flag anything that sounds like it needs real attention rather than trying to diagnose it.

### 9.7 Example flow

> User: "It's hot and I don't know what I want."
> Agent: infers hot-weather mode → leans toward `fresh`/`light` tagged dishes → asks one or two quick clarifying questions if needed → searches nearby restaurants for those dishes specifically → verifies 2–3 real menu matches via `web_fetch` → asks a tie-breaker only if still undecided → gives one decisive pick ("My pick: the Poke Bowl from [Restaurant]") with a reason tied to their answers, plus one backup → hands over a link to that restaurant's page.

### 9.8 Open items if this gets built for real

- Would need a real Places API key for anything beyond casual `places_search` usage, similar to the Supabase setup step already documented in Section 6.
- Decide whether the agent is a Claude Project (custom instructions + this system prompt), a Claude API integration, or something else — this doc doesn't assume a specific hosting choice yet.
- If the agent and the HTML app are ever meant to feel like one product rather than two parallel tools, worth deciding whether the agent should defer to the HTML app's exact dish database (so recommendations stay consistent) or whether live search should be allowed to surface dishes outside that list entirely.

### 9.9 Chat Mode — Implemented

A scoped-down version of the above is now live in `diagnose-your-craving.html`: real LLM chat, no live restaurant/menu search, no ordering automation (just a link out, same as the quiz path). Chose real-LLM over local keyword-matching because the person explicitly wanted genuine open-ended understanding, accepting the tradeoff of needing a backend and real per-message cost.

**Files:**
- `diagnose-your-craving.html` — chat UI (new `#chat` screen, entry button always visible on the start screen next to the tone toggle)
- `supabase-functions/chat-craving/index.ts` — the Edge Function (Deno) that proxies to the Anthropic API, keeping the key server-side

#### 9.9.1 How it works end to end

1. Start screen has a "💬 Just tell me what you're craving" button, always visible, alongside the quiz tone buttons (per explicit decision — not hidden behind a toggle).
2. Tapping it opens the `#chat` screen: message bubbles + text input, styled to match the app's dark neon aesthetic.
3. Each message calls `sb.functions.invoke('chat-craving', { body: { messages, tone } })` — using the same Supabase client already set up for account sync, so no separate URL or CORS config needed beyond having Supabase configured at all.
4. The Edge Function calls the real Anthropic API server-side (key held as a Supabase secret, never sent to the browser) and is instructed to reply with **strict JSON only** — either `{"type":"message","reply":"..."}` while still gathering info, or `{"type":"recommendation","reply":"...","dish":{...}}` once it's ready to commit to a pick.
5. On a `recommendation` response, the client calls `showResult(data.dish, data.reply)` — the **same** receipt/photo/map result screen the quiz uses, just fed an LLM-sourced dish object instead of one from `pickDish()`. `showResult()` was refactored to accept an optional external dish; when present, the receipt shows the LLM's reasoning line instead of the quiz's Q&A list, and skips quiz-only fields (side, dessert pairing) that don't apply to a chat-derived result.
6. Photo (LoremFlickr) and map (Maps embed) work exactly as before, since they only ever needed `dish.name`, `dish.query`, and `dish.cuisine` — fields the LLM is instructed to always include, whether or not the dish exists in the local 28-dish array. **Chat mode can recommend dishes outside the quiz's database.**
7. "Retake" clears both `chatMessages` and the visible message list, so reopening chat later starts a clean conversation rather than continuing an old one.

#### 9.9.2 System prompt (as actually implemented — simpler than 9.2)

Deliberately narrower than the full-agent prompt in Section 9.2: no live search, no restaurant verification, strict JSON contract for reliable parsing, tone-aware, at most one clarifying question before committing to a pick, and an explicit non-diagnostic instruction if someone describes something beyond ordinary hunger. Full text lives in `chat-craving/index.ts` as `SYSTEM_PROMPT` — kept in the function rather than duplicated here so there's a single source of truth to edit.

Model: **`claude-haiku-4-5-20251001`** — chosen for cost/speed given this is a short, bounded task (infer a craving, output one JSON object), not open-ended reasoning. Swap the `MODEL` constant in the Edge Function if more nuanced conversation is ever wanted; Sonnet would be the natural upgrade.

#### 9.9.3 Deployment steps (not yet done — same status as Supabase account sync in Section 6)

Requires the Supabase project from Section 6 to already exist. Then:

1. Install the Supabase CLI if you haven't: `npm install -g supabase`
2. From the project root (with `supabase-functions/chat-craving/index.ts` in place), link and deploy:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy chat-craving
   ```
3. Set the Anthropic API key as a secret (never put this in the HTML file):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
4. That's it on the backend side — no changes needed to `SUPABASE_URL`/`SUPABASE_ANON_KEY` in the HTML file beyond what Section 6 already requires, since the client reaches the function through the same Supabase client.
5. If `SUPABASE_CONFIGURED` is false (placeholder keys still in place) or the function isn't deployed yet, the chat screen shows a friendly "chat isn't set up yet" message and disables input — it fails gracefully rather than breaking, same pattern as guest-mode-only for account sync.

#### 9.9.4 Known gaps / open items specific to chat mode

- **Untested end to end** — written but not deployed or run against a real key yet. First thing to verify once the Edge Function is actually deployed: does the model reliably return valid JSON? The function has a fallback ("Sorry, I got a bit tongue-tied") if parsing fails, but that's a safety net, not a confirmation it works well in practice.
- **No rate limiting or abuse protection** on the Edge Function — anyone with the deployed function URL could rack up API costs. Worth adding basic rate limiting (e.g., per-user via Supabase auth, or a simple IP-based limit) before sharing this publicly.
- **No conversation length cap** — `chatMessages` grows unbounded during a session, sent in full on every request. Fine for a short back-and-forth; would need trimming/summarizing if conversations run long, both for cost and eventually for context-window limits.
- **Dish photo/map for LLM-sourced dishes inherit the same caveats as the quiz path** (Section 5) — keyword-matched photo, no-key Maps embed, both untested in a real browser as of this doc.
- **No history-awareness in chat mode yet** — the quiz's scoring pipeline gets a small boost from past orders (Section 4.3); the chat system prompt doesn't currently know about order history at all. Could be added by passing a summary of `history` into the Edge Function request if that consistency matters later.
- **Cost is real and untracked** — every message is a live API call. No usage dashboard or budget alerting is set up; worth keeping an eye on the Anthropic console directly, at least initially.

---

## 10. Repo Setup Pass (this round)

The project moved from loose files into this repo. What changed beyond the move:

### 10.1 Layout

The Edge Function now lives at `supabase/functions/chat-craving/index.ts`, not
`supabase-functions/` as Section 9.9.3 originally said. The Supabase CLI resolves
`supabase functions deploy chat-craving` against `supabase/functions/<name>/`, so
the deploy command in 9.9.3 would have failed against the old path. The function
source itself is unchanged. The SQL from Section 6 is now `supabase/schema.sql`
rather than a copy-paste block in this doc.

### 10.2 Map bug found in a real browser (open item #1)

Verified against headless Chromium over a local HTTP server, driving the quiz to
the result screen.

**The quiz, scoring, receipt render, and the photo's `onerror` emoji fallback all
work correctly.** But `loadNearbyMap()` had a real bug: the map iframe never got a
`src` at all, leaving the map area permanently blank.

Root cause: `getCurrentPosition`'s `timeout` option only starts counting **once
permission has been granted**. While the browser's permission prompt is still
pending — the default state for a first-time visitor who ignores it — neither the
success nor the error callback ever fires, and `timeout: 4000` does nothing.
Confirmed across three permission states:

| Permission state | Callback fired |
|---|---|
| prompt pending (default) | **neither, indefinitely** |
| explicitly denied | error, ~2ms |
| explicitly granted | success, ~3ms |

Fix: an independent `setTimeout` watchdog that falls back to the no-location map
after 4s, plus a `settled` flag so whichever path lands first wins and the map is
never set twice. Re-verified: all three states now load a map, and the granted
case still uses real coordinates.

**The photo is still unconfirmed.** Not for the reason Section 5 guessed — the
sandbox this was verified in blocks *all* third-party egress through its proxy,
including jsdelivr and Google Fonts, which Section 5 noted load fine inside
Claude's artifact preview. So this environment can't distinguish "LoremFlickr is
blocked here" from "LoremFlickr is broken." What *is* confirmed is that the
failure degrades correctly to the dish emoji rather than a broken-image icon.
Loading the page in an ordinary browser on a normal network is still the
outstanding check.

### 10.3 Escaping untrusted text (not previously tracked)

Three `innerHTML` sinks received text that isn't ours: the history list
interpolated user-typed restaurant names, and the receipt interpolated
`dish.name` / `dish.cuisine` / `dish.desc` / `dish.emoji` and the reasoning line,
which in chat mode all come from the model rather than the local dish array.
Added an `esc()` helper and applied it at those sites. Chat bubbles already used
`textContent` and needed no change.

Mostly self-XSS in guest mode, but it stops being self-inflicted once history is
synced to an account and rendered on another device, and the chat path puts
model-generated text into markup. Cheap to fix, so fixed.

### 10.4 The test sweep (open item #7)

`tests/pipeline.test.mjs` — 5,000 random playthroughs, run with
`node tests/pipeline.test.mjs`. It walks the real `questions` array honoring
`shouldSkip`, so it only generates answer combinations a player could actually
reach, and it extracts `questions`, `dishes`, `passesDietary`, and `pickDish`
directly out of the HTML at runtime rather than keeping a second copy.

It asserts the returned dish falls inside an independently computed eligible pool
(each gate from 4.2 applied in order, each with the documented
narrow-if-possible-else-fall-back semantics), that no stage empties the pool, and
that every dish stays reachable. Currently passing: 28/28 dishes win at least
once, top share ~15-18%.

**One caveat worth knowing before trusting it too far.** The test reports the win
distribution, but that check does *not* detect the Bibimbap bug from Section 4.4.
Removing the normalization from the scoring line leaves the top share in the same
~15-18% band on the current 28-dish database — verified by running the suite
against a deliberately un-normalized copy, which passed. The dish pool changed
enough since that bug (28 dishes plus the breakfast and dessert gates) that raw
tag-count advantage no longer dominates. So the dominance guard is a coarse
sanity check at >30%, not a regression test for normalization. If you want a real
guard on the scoring formula, it needs to assert on the formula itself, not on the
output distribution.

### 10.5 Supabase configured — and the latent crash it exposed

Real project URL and publishable key are now in the HTML, replacing the
placeholders from Section 6. The publishable key (`sb_publishable_…`) is the
current-generation replacement for the legacy `anon` JWT and plays the same role:
it is meant to ship in client code, with RLS doing the actual protection. The
constant is still named `SUPABASE_ANON_KEY` to avoid churn across its use sites.

Filling in the keys immediately broke the entire app, and it is worth
understanding why:

```
PAGEERROR: Cannot read properties of undefined (reading 'createClient')
```

`const sb = SUPABASE_CONFIGURED ? window.supabase.createClient(...) : null;` sat
at the top level of the inline script. While the keys were placeholders,
`SUPABASE_CONFIGURED` was false and that expression was never evaluated, so the
bug stayed invisible for the project's whole life. Once configured, it runs — and
if the jsdelivr SDK hasn't loaded, `window.supabase` is `undefined`, the throw
kills the *entire* inline script before any event handler is wired, and the app
becomes a static start screen with dead buttons. Not just account sync: the
quiz, history, everything.

The SDK can be missing for reasons that have nothing to do with configuration —
offline, blocked network, corporate proxy, ad-blocker, CDN outage. For an app
whose selling point is that it works with no backend, having a CDN failure take
down the quiz is the wrong tradeoff.

Fixed by treating a missing SDK as equivalent to being unconfigured: check
`typeof window.supabase?.createClient === 'function'` before constructing,
wrap the construction in try/catch, and derive `SUPABASE_CONFIGURED` from
whether a client actually exists (`!!sb`) rather than from whether the keys look
filled in. Every downstream gate already keyed off `SUPABASE_CONFIGURED`, so
they all now correctly mean "the client is usable". Guest mode is the fallback,
which is the same graceful path the placeholders always took.

Verified with the SDK unreachable: no page error, quiz advances, map still loads
in all three geolocation states, test suite still passing.

**Still outstanding for account sync and chat** — neither can be done from a
sandboxed session:
- Run `supabase/schema.sql` in the SQL Editor
- Auth → URL Configuration → add the deployed `https://` URL
- `supabase functions deploy chat-craving` and
  `supabase secrets set ANTHROPIC_API_KEY=…` (the Anthropic key must never enter
  this repo — it lives only as a Supabase secret)


---

## 11. v2 — MVP simplification (accounts removed)

Scope decision: drop the account layer entirely, keep the quiz and chat, and make
the page work with nothing configured. The app is now guest-only by design rather
than guest-by-default.

### 11.1 Removed

- **Supabase auth in full** — magic links, `sendMagicLink`, `signOut`,
  `onAuthStateChange`, the sign-in UI on the start screen, and its CSS.
- **`order_history` table, RLS policies, and `supabase/schema.sql`** — history is
  `localStorage` only, so there is no server-side data and nothing to secure.
- **`migrateLocalHistoryIfNeeded()`** — nothing to migrate to.
- **The `@supabase/supabase-js` CDN script tag.** This is the significant one:
  the page now has *zero* JavaScript dependencies. Google Fonts is the only
  remaining third-party request, and it degrades to system fonts.
- **`supabase/schema.sql`**, **`currentUser`**, **`authUIState`**, **`sb`**,
  **`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_CONFIGURED`**.

Dropping the SDK also retires the crash documented in §10.5 by removing its
cause rather than guarding it — there is no longer a CDN global to be missing.

### 11.2 Changed

- **Chat transport**: was `sb.functions.invoke('chat-craving', …)` through the
  Supabase client; now a plain `fetch(CHAT_ENDPOINT, …)`. One config constant,
  no SDK. The function must be deployed with `--no-verify-jwt` so the page can
  call it anonymously — noted in the function header and the README, along with
  the budget-exposure caveat that comes with it.
- **`CHAT_CONFIGURED`** replaces `SUPABASE_CONFIGURED` as the single gate on chat
  UI, derived from whether `CHAT_ENDPOINT` looks like a URL.
- **History functions are synchronous again** (`loadHistory`, `saveHistoryEntry`,
  `clearHistory`), since there is no network call behind them. `init()` collapsed
  to a single `loadHistory()`.

### 11.3 Unchanged

The 13 questions, skip logic, 28-dish database, filter pipeline, scoring formula,
receipt rendering, photo, map (including the §10.2 geolocation watchdog), the
`esc()` escaping from §10.3, and `tests/pipeline.test.mjs` are all untouched.

### 11.4 Verified

Headless Chromium, served over HTTP, with the network egress this sandbox allows:

- No page errors; the jsdelivr request is simply gone.
- Chat screen with no endpoint set → setup note shown, input disabled.
- Full quiz run → receipt renders.
- Order logged with `<img src=x onerror=alert(1)>Nando's` as the restaurant name
  → persists across a reload and renders as literal text, so §10.3 escaping still
  holds on the localStorage-only path.
- `tests/pipeline.test.mjs` still passing.

Still unverified for the same reason as before: the LoremFlickr photo (sandbox
blocks it) and chat end to end (needs a deployed function and a real key).

---

## 12. Photo — Kept, With a No-Photo Fallback Deployed Alongside It

The LoremFlickr photo (§5) was briefly removed after appearing to return
generic/unrelated stock images when checked from a desktop browser. Before that
removal reached `main`, real-device testing (a phone, repeated across several
runs) showed the photo resolving and matching correctly. That reopened the
question the sandbox could never settle on its own (§10.2, §11.4): whether the
failure was the photo service or the network path checking it. The phone
results say network path — so the photo is back as the default, and the
removal is kept as a second, explicitly no-photo variant rather than discarded.

**Two files now ship from this repo:**

- `diagnose-your-craving.html` — the default, with the LoremFlickr photo intact
  exactly as documented in §5.
- `diagnose-your-craving-no-image.html` — a second copy with `dishPhotoWrap`/
  `dishPhoto`/`dishPhotoFallback` and `loadDishPhoto()` removed, identical
  otherwise. Confirmed byte-identical to the default file outside the photo
  block (`questions`, `dishes`, scoring, map, chat — all unchanged) via `diff`
  before merging, and confirmed with a headless Chromium run through a full
  quiz on both.

**The deploy workflow (`.github/workflows/preview.yml`) now publishes both** to
separate paths in the same Pages deploy:
- `/` and `/diagnose-your-craving.html` — the default, with photo
- `/no-image/` and `/diagnose-your-craving-no-image.html` — the fallback

One dispatch, one Pages deploy, two live URLs — no second repo or second Pages
site needed. `tests/pipeline.test.mjs` only reads the default file by name
(unchanged), which is correct: the dish database and pipeline are identical
between the two, so testing one tests both.

**Maintenance note for whoever edits the dish database, questions, or scoring
next:** the two HTML files will drift out of sync if only one is edited. Until
this is scripted (e.g. generating the no-image file from the default via the
same kind of extraction `tests/pipeline.test.mjs` already does), any change to
`questions`, `dishes`, or the scoring/filter functions needs to be applied to
both files by hand — or re-derive `diagnose-your-craving-no-image.html` from
the current default by re-deleting the photo block, rather than editing it
independently.

---

## 13. Rebrand — foodpick.ai (accounts stay out, files renamed)

"Diagnose Your Craving" is retired. New identity, visual system, and copy —
see `BRANDING.md`, the source of truth for all of it. This section covers only
what BRANDING.md doesn't: how the rebrand was merged into the actual codebase.

**Approach: minimal diff from the known-good file, not a rebuild from the
design mockup.** A separate chat produced a full new HTML file
(`foodpick-ai.html` as uploaded) alongside `BRANDING.md`. That file was built
from an older lineage of this project — before accounts were stripped in §11,
before the escaping fix and map watchdog in §10, before the dual with-photo/
no-image split in §12. Rather than take it wholesale, the rebrand was applied
as a layer on top of the current working file: new `<style>` block, new
marquee/start-screen/loading-screen markup, new `showResult()` output (pills
instead of the ticket/receipt framing), tone toggle removed — but the
guest-only architecture, `esc()` escaping, the geolocation watchdog, and the
`CHAT_ENDPOINT`/fetch chat transport all carried over untouched from §11/§12.

**Decisions made explicitly, not inferred:**
- Accounts stay out. The new file (as given) had reintroduced Supabase auth;
  that was stripped back out to match §11's decision.
- The dish database is unchanged — verified by diffing every dish and every
  question header against the current live file before merging anything. Only
  documented change: Q12 (side) "None" option moved first.
- Chat still posts to `CHAT_ENDPOINT` via `fetch()`, not `sb.functions.invoke`.
  The Edge Function itself is a plain HTTP handler and doesn't care which
  client calls it, so this required no changes to `supabase/functions/chat-craving`.
- Both files renamed: `diagnose-your-craving.html` → `foodpick-ai.html`,
  `diagnose-your-craving-no-image.html` → `foodpick-ai-no-image.html`. The
  no-image variant was rebuilt the same way as before (§12) — photo block
  removed, everything else identical — from the new default file rather than
  the old one.

**What changed in the markup/script, concretely:**
- `<head>`: title, meta description, theme-color, apple-mobile-web-app-title
- Full `<style>` replacement: warm off-white palette (`--bg`/`--ink`/`--accent`
  etc.), Fraunces + Inter instead of Archivo Black/DM Sans/Courier Prime, pill
  tags (`.r-pill`) added, ticket-only classes (`.r-order-num`, `.r-item`,
  `.r-total`, `.r-barcode`) set to `display:none` rather than deleted, since
  `showResult()` still targets `.r-line` generically
- Marquee: bowl-and-steam SVG mark + wordmark + permanent tagline, replacing
  the old `<h1>` + tone-dependent tagline swap
- Start screen: single "Start the quiz" button, tone-toggle buttons removed
- New `#loading` screen, wired into `advance()` — `showScreen('loading')` then
  `setTimeout(showResult, 2000)` when the quiz completes
- `showResult()`: pills from `dish.tags.slice(0,4)` (escaped) replace the old
  answer-checklist/order-ticket lines; `picks` is still populated by
  `selectSingle`/the multi-select handler but no longer rendered — harmless,
  matches the new file's own behavior, not worth removing for this pass
- `headerText(q)` returns `q.header` directly (no more `.girly`/`.neutral`)
- Retake button copy: "🔁 PICK AGAIN"

**Verification:** Node syntax check on the extracted inline script for both
files, `<div>` open/close tag count balanced, `tests/pipeline.test.mjs`
(pointed at `foodpick-ai.html`) passing at 5,000 trials. Browser-level
click-through testing in this environment repeatedly hit Playwright
actionability timeouts that didn't reproduce in isolated minimal repros —
computed-style inspection at the failure point showed the element genuinely
visible, laid out correctly, and non-zero-size, so the working theory is
sandbox/harness flakiness under repeated Chromium launches rather than an app
bug, but this was **not fully run to a clean end-to-end pass** before this
doc was written. Confirming a full quiz run through the actual deployed
preview URL is the first thing to do after this lands.

## 14. Craving Analysis stage (POC) — quiz → analysis → profile → recommendation

Added a product layer between the last quiz question and the dish
recommendation, per spec: *Quiz → craving analysis → craving profile →
recommendation → find nearby*. Previously the quiz answers went straight into
`pickDish()` and onto the receipt with no explanation of what the app thought
you wanted. That's now a two-screen bridge:

1. **`#loading` (repurposed)** — was a plain 3-dot spinner labeled "Finding
   your pick"; now shows a staggered checklist ("Hunger level detected ✓",
   "Flavour preferences detected ✓", …, "Calculating your best match…") over
   ~2.9s (`ANALYSIS_STEPS` / `ANALYSIS_STEP_MS` / `ANALYSIS_TOTAL_MS`), purely
   presentational pacing.
2. **`#profile` (new)** — the "craving profile": an archetype name (e.g.
   "Japanese Heat Chaser"), a match percentage, a one-line synthesis, four
   detected attributes (Hunger / Richness / Flavour / Direction), and a
   "what you probably don't want" list. A button continues to the existing
   `#result` screen, now labeled "🎯 WHAT YOU ACTUALLY WANT" with a "why this
   matches" line and up to two alternate dishes.

**Deliberately no LLM involved.** Chat is paused for now (see §9), and this
stage doesn't need it anyway — every field in the profile is derived
deterministically from the same signals `pickDish()` already scores (the
`bag` tag tally, `desiredSize`, `cravingValue`, `dietaryFilters`). This keeps
the feature working with zero backend, consistent with the rest of the app.

**Implementation:**
- `pickDish()` was split into `getEligiblePool()` (the filter pipeline,
  unchanged) and `scorePool(pool)` (the tag-overlap scoring, now returning
  the full pool sorted descending instead of just the winner). `pickDish()`
  is now `scorePool(getEligiblePool())` + the same tie-break random pick as
  before — behavior-identical, verified by the pipeline sweep still passing
  on both variants.
- `computeCravingAnalysis()` calls `pickDish()` once for the winner, plus a
  second `scorePool` pass to pull the next two distinct-name dishes as
  alternates, then builds the profile via `buildCravingProfile(winner,
  scored)`.
- `buildCravingProfile()` heuristics, all tag-tally based:
  - **Hunger** ← `desiredSize` (light/medium/hearty → a label).
  - **Richness** ← tally of `RICH_TAGS` (creamy, cheesy, comfort, treat,
    crispy, juicy) vs `LIGHT_TAGS` (fresh, healthy, crunchy) in `bag`.
  - **Flavour** ← which of `FLAVOUR_TAGS` (spicy, savory, sweet, bold) are
    present in `bag`, ranked by count.
  - **Direction** ← dominant cuisine(s) among the top 5 scored dishes, not
    just the winner's own cuisine, so it reads as a "lean" rather than a
    single data point.
  - **Archetype** ← top cuisine + a mood word from `MOOD_WORDS`, matched
    against whichever mood tag (comfort/treat/bold/spicy/healthy/fresh/sweet)
    has the highest count in `bag`.
  - **Match %** ← `(0.55 + tagRatio*0.35 + sizeBonus)`, where `tagRatio` is
    the fraction of the winning dish's own tags that appear in `bag`, clamped
    to 72–97%. This is a heuristic confidence number for product feel, not a
    statistical claim — worth a comment if this becomes user-facing beyond a
    POC.
  - **"What you probably don't want"** ← contrast rules keyed off richness/
    flavour/size (e.g. high richness → "something bland or watery"; hearty
    appetite → "a tiny portion that won't fill you up").
- `tests/pipeline.test.mjs` now also extracts `getEligiblePool` and
  `scorePool` (pickDish depends on them) — still passes, 28/28 dishes
  reachable on both variants.

**Not done / open items:**
- No browser walkthrough was run in this pass — per the standing instruction
  to stop sandbox-testing this app, verification should happen against a
  live deployed preview URL instead.
- The archetype/mood-word vocabulary is small (7 moods) and dish-tag-driven;
  it'll repeat across quiz runs with similar answers. Fine for a POC, worth
  revisiting if this becomes permanent.
- If chat comes back online (§9/§13), the chat path still bypasses this
  entirely and goes straight to `#result` with its own "WHY THIS PICK"
  reasoning from the model — the craving-analysis stage is quiz-only by
  design, since chat already produces its own explanation conversationally.

## 15. Answer-space sweep for the craving-analysis layer — findings

`tests/pipeline.test.mjs` only ever checked the dish-filter pipeline
(`pickDish()`): no empty pools, no hard-filter violations, every dish
reachable. It has no coverage of the craving-analysis layer added in
section 14 — `buildCravingProfile()` / `computeCravingAnalysis()` — so a new
`tests/craving-analysis.test.mjs` sweeps 3,000 random answer combinations
plus 4 hand-picked edge cases (breakfast+sweet, every dietary filter at
once, a zero-signal bag, budget=1+hearty) through the analysis functions and
asserts the output stays sane: match % in its stated 72–97 band, no
`undefined`/`NaN`/`null` leaking into any user-facing string, no empty or
duplicate `dontWant` entries, no alternate that's a duplicate of the winner
or of another alternate. Run it with `node tests/craving-analysis.test.mjs`.

**No crashes or malformed output turned up** across the full sweep — the
analysis layer holds up structurally. But the run also prints distribution
stats (alternates-length spread, match % spread, archetype/richness
frequency), and three real, reproducible issues came out of reading them:

**1. Alternates silently disappear on a specific, common combo.**
`alternates.length` tracks `getEligiblePool().length` exactly — 0
alternates when the pool has 1 dish, 1 alternate when it has 2. Across the
sweep, **10.2% of runs got fewer than 2 alternates (5.6% got zero)**. The
cause: the breakfast and dessert-heavy sub-pools only have 5 dishes each,
and within each, only **one** dish is gluten-free (Shakshuka for breakfast,
Mochi Ice Cream Platter for dessert):

| pool | budget | cheese-free | gluten-free | dairy-free |
|---|---|---|---|---|
| breakfast (5) | 4 of 5 are budget 1 | 1 of 5 | **1 of 5** | 0 of 5 |
| dessert (5) | all 5 are budget 1 | all 5 | **1 of 5** | 0 of 5 |

So `meal: breakfast` or `craving: sweet` combined with `dietary:
glutenFree` deterministically narrows the pool to exactly one dish, every
time, regardless of any other answer. Two consequences: the Alternatives
section vanishes (the code correctly hides it rather than rendering
something broken, so this isn't a crash) and, more importantly, there's no
personalization left at all in that pool — a gluten-free breakfast/dessert
craving always recommends the same single dish. `noCheese` has the same
effect on breakfast at budget tier 1 specifically (only Fluffy Pancakes
qualifies). `dairyFree` doesn't hit this because *no* dish in either
sub-pool is dairy-free, so the narrow-to-empty fallback keeps the wider
pool instead — the bug only bites when a filter matches **exactly one**
dish, not zero.
  - Not fixed here — this is a data-coverage gap (the breakfast/dessert
    sub-databases are thin relative to dietary variety), not a logic bug.
    Fixing it means either adding a gluten-free option to each sub-pool or
    accepting the gap and being explicit about it in the UI (e.g. not
    showing an "Alternatives" label to expand toward if there's nothing to
    show — already the current behavior — perhaps also softening the
    "why this matches" framing when the pool was this constrained).

**2. Match % clusters at its own floor.** 25.4% of runs landed at exactly
72% — the clamp's lower bound — meaning the raw formula
(`0.55 + tagRatio*0.35 + sizeBonus`) produces a sub-72 value more often
than the "believable 72–97 band" comment intended. The number reads as
precise/data-driven but for a quarter of results it's just the floor,
independent of how good or bad the actual match is. Worth revisiting the
0.55 baseline or the band width if the match % is meant to carry real
signal rather than just avoid extreme numbers.

**3. Archetype and richness both skew toward "comfort".** Of the 8 most
common archetypes, 6 were some "___ Comfort Seeker" variant, and
"Richness: High — indulgent and comforting" showed up in 44.6% of runs vs.
10.6% for "Light and fresh". Root cause: the `comfort` tag can be
contributed by **two** different single-select questions (`occasion`:
"Surviving a rough day", and `vibe`: "Zero energy" / "Comfort mode" — two
of its five options), giving it roughly double the accumulation chance of
any other single mood/richness tag in `bag`. This confirms and quantifies
the "small vocabulary, will repeat" caveat already flagged in section 14 —
now with numbers. If broader variety matters, the fix is narrow: stop
`occasion` and `vibe` from both feeding the same `comfort` tag (e.g. give
`vibe`'s comfort options a distinct tag from `occasion`'s), not a rewrite
of the mood-word system.

None of this is fixed in this pass — flagged for a decision on whether it's
worth spending on before the next round of changes.

## 16. Acted on section 15's findings — dish coverage, mood-word variety, richness rebalance

Decisions made on the three findings from section 15:

**Finding 1 (alternates disappearing) — fixed via more dishes.** Added 11
new dishes (28 → 39 total): 5 to the breakfast pool, 5 to dessert-heavy, 1
to the regular pool, chosen specifically to close single-dietary-filter
gaps rather than just adding variety generally. All 11 are vegan (closing
the vegan/dairy-free/vegetarian/no-red-meat/no-seafood gap in one move,
since vegan implies all of those in this schema), and 8 of the 11 are also
gluten-free (closing the specific gap from section 15 — breakfast and
dessert each had exactly one GF dish before). Verified every dietary
attribute now has ≥5 matching dishes in every pool (breakfast, dessert-
heavy, regular) — see the audit in the commit, or rerun:
```
node -e "... audit script ..." # see git history for the one-off script
```
Result: the alternates-shortfall rate dropped from 10.2% of runs (5.6% zero,
4.6% one) to 3.8% (0% zero, 3.8% one). The remaining 3.8% is no longer a
single-filter problem — every remaining example sampled stacks 3-5 dietary
filters simultaneously plus budget=1, which is a much narrower, more
defensible edge case than before. Not chasing this further; further
improvement would need dishes covering specific multi-filter intersections,
a much worse effort-to-benefit trade than the single-filter fix was.

**Side effect caught and fixed while adding dishes:** two dead tags were
found in the process — `"light"` and `"hearty"` were used as dish tags on
several dishes (Mochi Ice Cream Platter, Breakfast Burrito) but neither is
ever produced by any quiz answer (`"light"`/`"hearty"` are `size` values,
not tags — confirmed by cross-referencing every question's option tags).
A dead tag inflates a dish's `tags.length` denominator in `scorePool()`'s
normalization without ever being matchable, which quietly disadvantages
that dish. This had been silently pre-existing on Mochi and Breakfast
Burrito; it became a real bug when the new Mixed Berry Sorbet accidentally
copied the same dead `"light"` tag and, having fewer *listed* tags for the
same real overlap, out-scored Mochi badly enough that Mochi became
completely unreachable in `pipeline.test.mjs`'s 5,000-trial sweep (caught
immediately by the existing "every dish must be reachable" assertion).
Fixed by dropping the dead tags from all affected dishes. Worth a general
lint pass on the rest of the dish database at some point.

**Finding 2 (match % floors out at 72%) — not fixed, options documented
with real numbers.** Re-ran the sweep after the new dishes (same formula):
still floors at 72% in 18.4% of runs. Simulated four alternative formulas
against the same 3,000 trials:

| variant | range | % at floor | % at ceiling |
|---|---|---|---|
| current (0.55 base, ×0.35, clamp 72–97) | 72–97 | 17.9% | 0.4% |
| A: raise baseline to 0.65 | 72–97 | 2.6% | 15.2% |
| B: widen clamp to 65–97, keep 0.55 base | 65–97 | 4.0% | 0.4% |
| C: sqrt curve on tagRatio, 0.55 base | 72–97 | 7.6% | 4.3% |
| D: baseline 0.60, clamp 68–97 | 68–97 | 2.6% | 4.3% |

Variant D looks best — lowest floor concentration *and* lowest ceiling
concentration simultaneously, widest spread of distinct values (25). A
raises the baseline enough to fix the floor but overcorrects into a new
15.2% pile-up at the ceiling. Not implemented — this is a product/tone
call (how "generous" the number should feel), left for a decision.

**Finding 3 (archetype/richness skew toward "comfort") — implemented, the
broader version.** Root cause was fully quantified this time: `comfort` is
reachable from 3 questions (occasion, vibe ×2 options, craving), `treat`
and `savory` from 2 each, everything else from exactly 1 — confirmed by
counting tags across every question's options, not estimated. Added
`TAG_SOURCE_COUNT` + `tagWeight()`/`weightedTally()` so every tag's
contribution to `bag` is divided by how many questions can produce it —
applied consistently to richness, flavour-label ranking, *and* the mood
word, since all three read from the same tag tally and were all skewed by
the same root cause. `MOOD_WORDS` expanded from 7 entries to 14 (added
savory, crispy/crunchy→Crunch, creamy, cheesy, fancy, shareable), and
`pickMoodWord()` now blends the top two moods into a compound name
("Comfort & Heat Seeker") when the second is within 75% of the top score,
instead of always collapsing to a single winner.

Result: distinct archetypes across the sweep went from 65 to 447; the most
common archetype dropped from 12.9% concentration ("American Comfort
Seeker") to 1.5%. Richness rebalancing was a necessary side effect (same
root cause, same fix) — but the old `richCount - lightCount >= 2` cutoff
for "High" was tuned for raw integer counts, and against the new fractional
weighted scale it collapsed "High" to 11.4% while "Medium to high" absorbed
55%. Retuned the cutoff to `>= 1` against a fresh 5,000-sample distribution
of the weighted `richCount - lightCount` value (percentiles checked
directly, not guessed) — final spread: High 40.2%, Medium to high 26.2%,
Light and fresh 26.0%, Balanced 7.6%. No bucket dominates; Balanced being
the smallest is expected and fine — it requires an exact tie on fractional
weighted values, which is inherently less common than with the old integer
tally.

`tests/craving-analysis.test.mjs` updated for the renamed helper
(`tallyTags` → `weightedTally`) and rerun clean throughout. No changes to
`pickDish()`'s own scoring (`scorePool()`), which was never part of the
skew — only the profile/archetype layer used `bag` tallies unweighted.

## 17. Archetype naming simplified — dropped the compound blend

Feedback after testing section 16's changes: archetypes were reading as
wordy and overly specific, e.g. *"Mediterranean Creamy-Comfort &
Special-Occasion Seeker"*. The culprit was the compound-mood feature added
in section 16 (blending the top two moods with "&" when close) stacked on
top of hyphenated multi-word labels ("Creamy-Comfort", "Special-Occasion",
"Cheese-First", "Bold-Flavor") — each individually reasonable, but
combined they produced names with 4-5 stitched-together concepts.

Fix: dropped the compound blend entirely (`pickMoodWord()` now always
returns the single strongest mood, no more `&`), and renamed every
`MOOD_WORDS` label to a short, single-concept word — Bold-Flavor→Adventure,
Sweet-Tooth→Sweet Tooth, Creamy-Comfort→Creamy, Cheese-First→Cheesy,
Special-Occasion→Fancy. Dropped `shareable`→Sharing entirely; "Sharing
Seeker" didn't read as a real personality archetype.

The weighted tally from section 16 (`TAG_SOURCE_COUNT`/`tagWeight`) still
does the real work of avoiding "comfort" dominance even with a single
winner — average archetype length dropped from 34.4 to 22.5 characters
(max 54 → 31), and distinct archetypes across a 3,000-trial sweep went
from 447 (with compounding, arguably too specific to be a real "type") to
108 (single mood only), with the most common archetype still only 5.2%
of runs — no single archetype dominates, and every one reads as a
plausible short label rather than a stitched-together sentence.

Richness (which reads from the same weighted tally but not from
`pickMoodWord()`) was unaffected — still spreads across all 4 buckets, no
change needed there.

## 18. Archetype endings varied — dropped the universal "Seeker" suffix

Feedback after section 17: every archetype still ended in "Seeker"
regardless of mood, which read as mechanical rather than fun — a generated
label, not a real one. `MOOD_WORDS` entries now store the full closing
phrase instead of a bare adjective + fixed " Seeker" suffix, matched to how
each word actually wants to be said: "Adventure Seeker" keeps "Seeker" (it
fits), "Heat Chaser" and "Indulgence Chaser" use "Chaser", "Sweet Tooth"
takes nothing at all, "Savory Purist", "Crunch Hunter", "Cheese Lover",
"Fine Dining Type" each get their own natural ending. The empty-signal
fallback (essentially never hit in practice) changed from "Flavor Seeker"
to "Open-Minded Eater" for the same reason.

Sample after the change: "Chinese Comfort Craver", "Thai Adventure
Seeker", "American Sweet Tooth", "Mexican Savory Purist", "Japanese
Creamy Craver" — no repeated suffix pattern in a random sample of 24.
Distinct archetypes across a 3,000-trial sweep: 115 (was 111 with the
uniform-Seeker version — essentially unchanged, since variety was already
coming from the weighted tally in section 16, not the suffix), top
concentration unchanged at ~5%.

## 19. Archetype wording reverted to the original — sections 17/18 undone

Explicit direction: revert the archetype/mood-word naming back to the
version from when Craving Analysis first shipped (section 14), and stop
there — no further iteration in this pass.

`MOOD_WORDS` and `pickMoodWord()` are back to the original 7-entry
vocabulary and algorithm verbatim (`Comfort Seeker`, `Indulgence Seeker`,
`Bold Flavor Chaser`, `Heat Chaser`, `Freshness Seeker`, `Sweet Tooth`),
using raw `bag[]` counts with no `TAG_SOURCE_COUNT` weighting and no
compound blending — undoing both the section 16 mood-word reweighting and
the section 17/18 vocabulary expansion and suffix-variety work.

**Deliberately scoped to the mood word only.** `TAG_SOURCE_COUNT` /
`tagWeight()` / `weightedTally()` are untouched and still drive richness
and the flavour-label ranking — that part of section 16 fixed a real bug
(richness's "High" bucket collapsing) and wasn't part of this complaint,
so it stays. Only `pickMoodWord()`'s own tally reverted to raw counts.

Consequence, expected and accepted: the original "comfort dominates"
skew is back for archetypes specifically — a 3,000-trial sweep now shows
"American Comfort Seeker" at 12.6% (matching section 15's original
finding almost exactly), vs. 5-6% concentration with either of the two
since-reverted attempts. Richness stays healthy (39/27/26/8% spread,
unaffected by this revert). If archetype variety becomes a priority
again, sections 16-18 document three different approaches already tried
(weighted tally + compound blend, weighted tally + varied single-word
suffixes, weighted tally + natural per-mood closing phrases) and why each
one's follow-up attempt was reverted, which should save re-deriving them
from scratch.

## 20. Real dish photos — one pinned URL per dish, replacing LoremFlickr

The photo problem flagged all the way back in section 12/§3 (LoremFlickr's
keyword search "loaded fine but returned generic/unrelated stock images")
is fixed properly now instead of worked around: `loadDishPhoto()` no longer
builds a keyword search URL. Every dish carries a specific `photo` field —
one pinned Wikimedia Commons image URL chosen for that exact dish, or
`null` for the one dish with no confident match. `loadDishPhoto()` just
sets `img.src = dish.photo`, falling back to the emoji (same as before) for
either `photo: null` or an `onerror` on load — one code path covers both
cases now instead of a keyword-search-always-returns-something design.

**Sourcing was constrained by this session's own network policy.** The
sandbox blocks egress to `upload.wikimedia.org`, `images.unsplash.com`,
`images.pexels.com`, and `live.staticflickr.com` entirely (confirmed via
direct `curl`/`fetch` — same class of block noted earlier for
`dianagy.github.io`, see the mid-session detour where GitHub Pages had to
be checked via the GitHub API instead of a direct fetch). A background
agent sourced all 39 URLs via `WebSearch` (a separate mechanism that does
work here) to find real Commons file pages, then mechanically constructed
each direct file URL from MediaWiki's public, deterministic filename-hash
scheme (`MD5(filename)` → `/first-hex-char/first-two-hex/filename`) — a
real, standard algorithm, not a guess, but one that was never confirmed to
actually resolve, since nothing in this session can reach the host to
check. **38 of 39 have a URL; 1 (Jackfruit Tacos) has no confident match at
all** — Commons has plenty of raw-jackfruit photos but nothing depicting a
prepared jackfruit taco dish, so it stays on the emoji fallback.

Several of the 38 are flagged lower-confidence in the sourcing notes (kept
in this session's scratchpad, not committed) — worth a manual look if they
turn out wrong: Overnight Oats with Berries (berries not confirmed in
shot), Mexican Breakfast Bowl (a real Chipotle bowl — correct dish
category, not confirmed vegan), Coconut Chia Pudding and Coconut Rice
Pudding (coconut specifically not confirmed), Belgian Waffles & Ice Cream
(ice cream not confirmed in frame), Mixed Berry Sorbet (the actual file is
a *cranberry* sorbet — same visual category, not an exact match), Vegan
Chocolate Mousse (a licorice-flavored variant), and Falafel & Hummus Plate
(a long, date-prefixed filename with higher transcription risk, and
reportedly a very large original — thumbnailed to 600px here regardless).

**Real verification happens in CI, not in this session.** Added
`tests/dish-photos.test.mjs`, which fetches every `photo` URL and checks
HTTP 200 + an `image/*` content-type + a non-trivial response size. It
can't pass locally in this sandbox (no route to the host at all — see
above), but GitHub Actions runners aren't network-restricted, so wiring it
into `preview.yml` makes every future dispatch the actual live check this
session couldn't do itself. It's `continue-on-error: true` — informational,
not a deploy gate — since a dead link already degrades to the emoji rather
than breaking anything, so one bad URL shouldn't hold back the other 37
working ones. Check the step's own outcome (not just the job's overall
green checkmark, which `continue-on-error` masks — pull the step's actual
log output) to see if any URLs need fixing after a dispatch.

**First dispatch caught a real bug in the URL construction, not just
sourcing risk.** The initial URLs pointed at Commons' `/thumb/` transform
endpoint (`.../thumb/<hash>/<filename>/600px-<filename>`), chosen to keep
the download small since `.dish-photo-wrap` only ever shows a 16:10 crop.
Every single one of the 38 came back HTTP 400 — not a sourcing miss on a
few files, a uniform failure on the transform endpoint itself. (A
"missing User-Agent" theory was tried and ruled out first: Wikimedia's
CDN docs ask for one, and Node's bare `fetch()` sends none by default
unlike a browser `<img>`, but adding one made no difference.) Deriving
each file's plain, non-thumbnail URL
(`.../wikipedia/commons/<hash>/<filename>`, no `/thumb/` or size suffix)
and fetching that instead came back mostly HTTP 200 — confirming the
MD5-hash file paths themselves were right, and the bug was specifically in
the thumbnail transform this session never got to observe. All 38 `photo`
fields now point at the full-size original directly; `object-fit: cover`
in `.dish-photo-wrap` already crops to the display box regardless of
source resolution, so this only costs load time, not correctness.

**Confirmed fixed, with one caveat that turned out to be a false alarm
about the URLs themselves.** The next real dispatch (foodpick.ai run #18)
came back with zero HTTP 400s — the full-size switch fixed it. 10 of 38
returned a clean 200; the other 28 came back HTTP 429, even at one request
per dish and concurrency 4. That ruled out this test's own request pattern
as the cause (already minimal by that point) — the far more likely
explanation is that GitHub Actions runners share IP ranges across a huge
volume of unrelated jobs, and Wikimedia rate-limits by IP; a real user's
browser, on its own residential/mobile IP, doesn't carry that reputation
and isn't expected to hit this. `dish-photos.test.mjs` now says so in a
comment, so a future batch of 429s doesn't get mistaken for bad URLs
again. Net result across all 38: a mix of confirmed-200 and
inconclusive-429, zero 400/404/bad-content-type — so no dish needs
re-sourcing right now. If a future run shows a 400, 404, or non-image
content-type for a specific dish (not a 429), that one is the real
signal — go re-source just that dish from the notes above.

## 21. Project-setup cleanup — generated no-image variant, shared test helper, one-command ship

Three of the six project-setup friction points from an earlier brainstorm,
acted on together since they're all mechanical and low-risk (unlike the
other three — chat-backend setup, repo consolidation, and auto-deploy-on-push
— which were explicitly left as-is, a product/ops call rather than something
to just do).

**`foodpick-ai-no-image.html` is no longer committed.** Every prior change
to `foodpick-ai.html` needed a matching hand-run strip script to keep the
no-image variant in sync — real copy-paste risk, and it doubled every diff.
`scripts/build-no-image.mjs` now derives it from `foodpick-ai.html` via four
regex-based strips (photo CSS, markup, the `loadDishPhoto()` call site, and
the function itself), each of which throws with a clear message if its
target block isn't found rather than silently producing a broken file.
Verified byte-identical against the previously hand-maintained copy before
removing it from git. `preview.yml`'s deploy job now runs the script before
staging `_site/`, so the published no-image variant is always freshly
derived from whatever `foodpick-ai.html` looked like at that commit — it
can no longer drift. Anyone who wants a local copy runs
`node scripts/build-no-image.mjs`; `--check` compares against an existing
file without writing, for anyone who wants a drift check without CI.

**`tests/extract.mjs`** replaces three near-identical copies of
`extractBlock`/`extractRange` that had been hand-rolled separately in
`pipeline.test.mjs`, `craving-analysis.test.mjs`, and (a simpler `indexOf`
variant) `dish-photos.test.mjs`. All three now import the same two
functions; behavior is unchanged (confirmed by re-running all three test
suites — 5,000/3,000-trial sweeps still pass, dish extraction still finds
all 39 dishes with 38 photos).

**`scripts/ship.sh "commit message"`** bundles the manual sequence this
session kept re-running by hand: run `pipeline.test.mjs` and
`craving-analysis.test.mjs`, then `git add -A && git commit && git push -u
origin <current-branch>`. Deliberately does not run
`tests/dish-photos.test.mjs` (needs real network the dev machine may not
have) or dispatch `preview.yml` (deploy stays a separate, explicit step per
the auto-deploy decision above).

## 22. Dark mode

Single light palette only, previously — CSS custom properties were already
centralized in `:root` (9 variables: `--bg`, `--card`, `--ink`, `--muted`,
`--accent`, `--pill-bg`, `--pill-text`, `--rule`, `--border`), so adding a
dark variant was additive rather than a rewrite, as flagged in the earlier
UI/UX brainstorm.

**Two trigger paths, manual always wins.** A dark palette is defined twice:
once under `@media (prefers-color-scheme: dark)` (guarded by
`:root:not([data-theme="light"])` so an explicit "light" pick can override
the OS setting), and again under `:root[data-theme="dark"]` (so an explicit
"dark" pick applies regardless of OS setting). A 🌙/☀️ toggle button
(fixed top-right, visible on every screen) sets `data-theme` on
`<html>` and persists the choice to `localStorage` (`foodpick_theme`); a
`matchMedia` change listener keeps following the OS setting live for anyone
who hasn't touched the toggle. `<meta name="theme-color">` updates to match,
so the browser chrome (address bar on mobile) follows too.

**Flash-of-wrong-theme avoided** by a tiny inline `<script>` placed directly
in `<head>` (before any CSS renders) that reads the stored preference or OS
setting and sets `data-theme` synchronously — the main theme logic (button
icon, `matchMedia` listener, meta tag sync) runs later, in the regular
bottom-of-body script, once those DOM elements exist.

**Found and fixed real light-mode leakage while wiring this up:** eight
places hard-coded `background: #fff` instead of `background: var(--card)`
(chat bubbles, profile-attr cards, dietary/settings inputs, the receipt
card) — harmless in light mode since `--card` was already `#ffffff`, but
would have stayed white in dark mode, breaking every one of those elements.
Also one inline SVG (`stroke="#3A3339"` on the marquee's smile icon) fixed
to `stroke="currentColor"`, which resolves through the existing `color:
var(--ink)` inheritance from `body`. Verified by walking the full flow
(start → quiz → craving profile → result, including the receipt card,
tag pills, alternates, and map-fallback text) as screenshots under a
simulated dark OS preference — no white leaks anywhere in the flow.

## 23. Order history insight card

The History screen already computed a one-line "most ordered: X (Nx)"
summary in plain muted text — easy to miss, and cuisine-only. Upgraded to a
proper card (matching the visual weight of the craving-profile attribute
cards) with two lines: most-ordered cuisine, and most-ordered specific
dish. The dish line only appears once a dish has actually repeated
(`topDish[1] > 1`) — at 1-2 total orders, "your favorite dish" is really
just "your only dish," which reads oddly as an insight. Verified with
seeded `localStorage` history (5 orders, 3 of the same dish) via a
Playwright screenshot.
