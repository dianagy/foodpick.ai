# foodpick.ai — Brand Guide

Reference doc for continued development. Pairs with `HANDOFF.md` (architecture/logic) — this doc covers identity and visual system only.

---

## 1. Identity

**Name:** foodpick.ai
**Wordmark styling:** lowercase always — `foodpick.ai`, never "FoodPick.ai" or "Food Pick.ai"
**Tagline:** "The last 'idk what to eat' you'll ever type."

**What changed from the previous identity:** this project was originally branded "Diagnose Your Craving," built entirely around a clinic/diagnosis metaphor (🩺 icon, "diagnosis in progress," "your symptoms, decoded," a printed-receipt reveal styled like a medical bill). That's been retired. Copy is now built around **picking**, not diagnosing — the check-in-circle mark reads as "pick confirmed," not "diagnosis complete." If you find leftover diagnosis-flavored copy anywhere, it's a bug, not a feature — see Section 5 for the exact before/after mapping used during the rebrand.

---

## 2. Logo Mark

Single-line, ink-colored, no fill. A simple bowl with a steam wisp above it — warm and food-first rather than clinical.

```html
<svg viewBox="0 0 32 32">
  <path d="M6,14 Q16,26 26,14" fill="none" stroke="#3A3339" stroke-width="1.6" stroke-linecap="round"/>
  <line x1="16" y1="6" x2="16" y2="11" stroke="#3A3339" stroke-width="1.6" stroke-linecap="round"/>
</svg>
```

**Usage:**
- Sits at the very top of the start screen, above the tagline and wordmark (order: mark → tagline → wordmark)
- Can stand alone as a favicon/app-icon glyph on a solid `--bg` (#FBF6F0) background
- Never recolor the stroke — it's always `--ink` (#3A3339), even in dark contexts (use a light version of the mark, not a color swap, if a dark background is ever needed)
- Don't add fill, drop shadow, or outline effects — the whole point is that it's quiet

**Other mark concepts explored and rejected** (kept here in case direction changes later): a literal ℞ prescription character, an "orbit dot" (circle + offset dot), a pulse/EKG line, and a check-in-circle ("pick confirmed"). The check-in-circle was the initial pick before switching to bowl-and-steam for a warmer, more food-first feel.

---

## 2a. Start Screen Layout Order

Top to bottom: **compact header row (mark + wordmark, inline, small) → tagline (large, centered, own section)**. The header row is deliberately quiet — 40px mark, 20px wordmark, side by side — so it reads as a label, not the hero. The tagline gets real vertical breathing room (56px/48px padding above/below) and lands at 26px/600 weight in full `--ink`, making it the visually dominant element on the start screen rather than the wordmark.

---

## 3. Color

```css
--bg:       #FBF6F0;  /* page background — warm off-white, not pure white */
--card:     #FFFFFF;  /* cards, inputs, elevated surfaces */
--ink:      #3A3339;  /* primary text, primary buttons */
--muted:    #A8998F;  /* secondary text, placeholders, disabled states */
--accent:   #C97B63;  /* the one warm accent — labels, links, progress fill, focus */
--pill-bg:  #F3D9D0;  /* tag/pill backgrounds, selected-option state */
--pill-text:#8A5A48;  /* text on pills */
--rule:     #F0E6DB;  /* hairline dividers, subtle borders */
--border:   #E3D5C9;  /* input borders, secondary button borders */
```

**Rules:**
- `--accent` is used sparingly — small labels, the progress bar fill, links, focus states. It is never a large fill (no accent-colored buttons or backgrounds).
- Primary actions are `--ink` on `--bg`/`--card` (dark pill button), not the accent color. The accent is a highlight, not the primary action color.
- No gradients, no glows, no drop shadows beyond very soft ambient card elevation (`0 16px 40px rgba(74,65,73,0.08)` — barely-there, never a hard shadow).
- This palette replaced a dark "neon diner" system (`#14111a` background, neon pink/yellow/teal). If you see those hex values anywhere, it's leftover from the old identity.

---

## 4. Typography

**Display:** Fraunces (variable, optical sizing on) — weight 300–500, regular style for most headings, italic reserved for occasional emphasis only (not used in the current build, but available)
**Body:** Inter — weight 400–600
**Do not use:** Archivo Black, DM Sans, Courier Prime, or any monospace — these belonged to the previous "neon diner receipt" identity and should be fully retired.

**Scale in use:**
| Role | Font | Size | Weight |
|---|---|---|---|
| Wordmark (`foodpick.ai`) | Fraunces | 26px | 400 |
| Question text | Fraunces | 19px | 400 |
| Result dish name | Fraunces | 21px | 400 |
| Body copy | Inter | 13–14px | 400 |
| Tagline | Inter | 17px | 600 |
| Buttons | Inter | 13.5px | 500 |
| Labels (uppercase, small) | Inter | 10–11px | 600, letter-spacing 1–1.5px |
| History items (dish name) | Fraunces | inherited | 500 |

Letter-spacing is used only on small uppercase labels (progress label, section eyebrows) — never on body text or headings.

---

## 5. Voice & Copy

**Principles:**
- Warm but understated — never perky, never using exclamation points to manufacture energy
- Humor through understatement, not enthusiasm
- Calm confidence: the app has an answer, it doesn't need to sell you on it
- Minimal emoji — used functionally (as option icons in the quiz) rather than decoratively in body copy
- Sentence case throughout, except intentional small-caps labels (progress bar, section eyebrows)
- Single unified voice — there is no tone toggle anymore. Previous versions had a "girly" and "neutral" mode; that's been merged into one voice, closer to the old neutral mode's directness with slightly more warmth.

**Exact copy migration** (from the "Diagnose Your Craving" era to now — reference if you find stale copy):

| Element | Old | Now |
|---|---|---|
| Masthead | "Diagnose Your Craving" | foodpick.ai |
| Tagline | "A very official diagnosis, delivered by takeout." / "A quick set of questions to land on tonight's order." | "The last 'idk what to eat' you'll ever type." |
| Start icon | 🩺 emoji | Check-in-circle mark (Section 2) |
| Tone selector | "💅 Girly" / "📋 Neutral" buttons | Removed — single "Start the quiz" button |
| Progress label | "DIAGNOSIS IN PROGRESS" | "FINDING YOUR PICK" |
| Result header | "TONIGHT'S DIAGNOSIS" / "TONIGHT'S PICK" | Removed entirely — the card leads with the dish itself, no header label |
| Answer checklist | "YOUR SYMPTOMS, DECODED" / "YOUR ANSWERS" + itemized list of every quiz answer | Removed — replaced with up to 4 small pill tags pulled from the dish's own characteristics (e.g. "spicy," "comfort," "noodles"), not a record of what was clicked |
| Order ticket framing | "ORDER #4821 · 9:42 PM", a "TOTAL — ON THE HOUSE" line, and a barcode graphic | Removed entirely — didn't fit the calmer identity |
| Retake button | "🔁 RETAKE QUIZ" | "🔁 PICK AGAIN" |
| Chat reasoning | "WHY THIS PICK" / "REASONING" (tone-split) | "WHY THIS PICK" (single version) |

**Untouched** — these never referenced the diagnosis metaphor and didn't need to change: chat entry button copy, history badge copy, dietary/budget/format question wording, all 13 quiz question headers and options (already fairly neutral to begin with), map/photo section copy, account sign-in copy.

**Writing new copy:** ask what the calmest, most direct way to say it is, then check it doesn't need an exclamation point to land. If a line only works with an emoji or an exclamation point propping it up, rewrite it plainer instead.

---

## 6. Layout & Components

**Cards:** white (`--card`), 20px border-radius, soft ambient shadow only, generous internal padding (22–26px). No borders on the primary result card; thin `--rule` borders on secondary elements (options, history items).

**Buttons:**
- Primary: solid `--ink` fill, `--bg` text, full pill radius (999px), no shadow, no hover-lift — just a subtle opacity change on hover
- Secondary: transparent fill, `--ink` text, 1px `--border` outline
- No drop shadows, no transform/lift animations on hover — this identity doesn't reward interactions with movement, just a quiet opacity shift

**Quiz options:** white background, thin `--rule` border by default; selected state fills with `--pill-bg` and `--pill-text`, no color/background change on the button itself otherwise (no bold neon selected-state)

**Result card structure (top to bottom):** photo → pill tags (from the dish's own attributes, not the user's answers) → dish name → cuisine → description → optional side/dessert/history note → optional chat reasoning → map → action buttons. No ticket number, no total, no barcode, no itemized answer list.

**Progress indicator:** a thin (3px) line that fills with `--accent`, plus a small uppercase label below it. No dot-based step indicators, no numbered badges.

---

## 7. What NOT to do

- Don't reintroduce the tone toggle without an explicit decision to do so — the current build has a single unified voice by design, not by omission
- Don't bring back the receipt/ticket motif (barcode, order number, "total") — it belonged to the old identity and was deliberately cut
- Don't show the user's own answers back to them as an itemized list on the result screen — pills should reflect the dish's characteristics, not a transcript of the quiz
- Don't use neon colors, drop shadows, hard outlines, or tilted/sticker-style elements anywhere — those belong to design directions that were explored and not chosen (see `design-directions.html` in the project history if you want to see what was rejected and why)
- Don't add exclamation points or heavy emoji use to make copy feel more "fun" — if a line needs that to land, the line is the problem
