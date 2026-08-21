# foodpick.ai

"The last 'idk what to eat' you'll ever type." A quick 13-question quiz (or a
quick chat instead), one dish recommendation, a nearby-restaurants map. See
`BRANDING.md` for the identity/visual system and `HANDOFF.md` for architecture.

One HTML file. No build step, no accounts, no sign-in. Open it and it works.

## Two variants

- `foodpick-ai.html` — default, includes a dish photo (keyword-matched via
  LoremFlickr, falls back to the dish's emoji if the image fails to load)
- `foodpick-ai-no-image.html` — identical otherwise, with the photo removed.
  Useful if the photo service is unreachable on your network; see `HANDOFF.md`
  §12 for why this fallback exists.

The deploy workflow publishes both — see **Preview deploy** below.

## Run it

Open `foodpick-ai.html` in a browser. That's it.

For a closer match to production — geolocation is blocked on `file://`, so the
map can only show its generic fallback there:

```bash
python3 -m http.server 8000
# http://localhost:8000/foodpick-ai.html
```

## What needs a backend

Only chat. The quiz, scoring, receipt, photo, map, and order history all run
entirely in the browser with nothing configured.

Chat needs a backend because the Anthropic API key must never sit in client
code. If `CHAT_ENDPOINT` is empty the chat screen shows a short setup note and
disables its input; nothing else is affected.

## Preview deploy

`.github/workflows/preview.yml` publishes both variants to GitHub Pages in one
deploy, so you can open each on a real URL. It is **dispatch-only** — nothing
deploys on its own:

```bash
gh workflow run preview.yml --ref main
```

Or Actions tab → **Preview** → **Run workflow**. It runs the pipeline sweep
first and refuses to deploy if that fails; both URLs are printed in the job
summary:

- `<pages-url>/` — the default, with photo
- `<pages-url>no-image/` — the fallback, without photo

One-time setup: **Settings → Pages → Source = "GitHub Actions"**. This repo is
public, so Pages works on the free plan.

## Layout

| Path | What it is |
|---|---|
| `foodpick-ai.html` | The entire app — HTML, CSS, and JS in one file, with photo |
| `foodpick-ai-no-image.html` | Same app, photo removed |
| `BRANDING.md` | Identity, color, type, voice, and layout reference |
| `supabase/functions/chat-craving/index.ts` | Serverless function proxying chat to the Anthropic API |
| `tests/pipeline.test.mjs` | Sweeps the answer space against the dish filter pipeline |
| `tests/craving-analysis.test.mjs` | Sweeps the answer space against the craving-analysis layer (profile, match %, alternates) |
| `tests/dish-photos.test.mjs` | Checks every dish's pinned photo URL is a live image (needs real network access) |
| `.github/workflows/preview.yml` | Manual (`workflow_dispatch`) test + Pages preview deploy |
| `HANDOFF.md` | Design history, scoring rationale, and open items |

## Tests

```bash
node tests/pipeline.test.mjs
node tests/craving-analysis.test.mjs
node tests/dish-photos.test.mjs
```

`pipeline.test.mjs` runs 5,000 random playthroughs asserting the filter
pipeline never returns an empty pool or a dish violating a hard filter, and
that every dish stays reachable. `craving-analysis.test.mjs` sweeps the same
answer space through the craving-profile layer (section 14 of `HANDOFF.md`) —
match %, archetype text, alternates — asserting nothing malformed leaks into
a user-facing string; see `HANDOFF.md` section 15 for real (non-crashing)
issues it surfaced. Both extract their logic straight out of the HTML, so
there's no second copy to drift.

`dish-photos.test.mjs` fetches every dish's pinned photo URL and checks it
resolves to a real image — needs actual internet access, so it won't pass in
a network-sandboxed environment (that's expected, not a bug in the test).
It's wired into `preview.yml` as non-blocking (`continue-on-error`), since a
dead photo link already falls back to the dish's emoji rather than breaking
anything.

## Enabling chat

Any serverless host works — the function is a single POST handler. Using
Supabase Edge Functions:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy chat-craving --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Paste the printed function URL into `CHAT_ENDPOINT` near the top of the
`<script>` block in the HTML.

`--no-verify-jwt` lets the page call the function anonymously, which also means
anyone with the URL can spend your API budget. Add rate limiting before sharing
it publicly.

## History

Order history lives in `localStorage`, per browser. There are no accounts, so it
doesn't follow you across devices, and clearing site data clears it.
