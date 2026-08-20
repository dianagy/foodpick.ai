# foodpick.ai

A "what should I order for takeout" quiz. Answer 13 questions (with branching
skip logic), get one dish recommendation rendered as a printed thermal receipt,
plus a photo and a nearby-restaurants map. There's also a chat mode that talks to
an LLM instead of using the button quiz.

One HTML file. No build step, no accounts, no sign-in. Open it and it works.

## Run it

Open `diagnose-your-craving.html` in a browser. That's it.

For a closer match to production — geolocation is blocked on `file://`, so the
map can only show its generic fallback there:

```bash
python3 -m http.server 8000
# http://localhost:8000/diagnose-your-craving.html
```

## What needs a backend

Only chat. The quiz, scoring, receipt, photo, map, and order history all run
entirely in the browser with nothing configured.

Chat needs a backend because the Anthropic API key must never sit in client
code. If `CHAT_ENDPOINT` is empty the chat screen shows a short setup note and
disables its input; nothing else is affected.

## Preview deploy

`.github/workflows/preview.yml` publishes the app to GitHub Pages so you can
open it on a real URL. It is **dispatch-only** — nothing deploys on its own:

```bash
gh workflow run preview.yml --ref main
```

Or Actions tab → **Preview** → **Run workflow**. It runs the pipeline sweep
first and refuses to deploy if that fails; the deployed URL is printed in the
job summary.

One-time setup: **Settings → Pages → Source = "GitHub Actions"**. This repo is
public, so Pages works on the free plan.

## Layout

| Path | What it is |
|---|---|
| `diagnose-your-craving.html` | The entire app — HTML, CSS, and JS in one file |
| `supabase/functions/chat-craving/index.ts` | Serverless function proxying chat to the Anthropic API |
| `tests/pipeline.test.mjs` | Sweeps the answer space against the dish filter pipeline |
| `.github/workflows/preview.yml` | Manual (`workflow_dispatch`) test + Pages preview deploy |
| `HANDOFF.md` | Design history, scoring rationale, and open items |

## Tests

```bash
node tests/pipeline.test.mjs
```

5,000 random playthroughs asserting the filter pipeline never returns an empty
pool or a dish violating a hard filter, and that every dish stays reachable. It
extracts the dish database and `pickDish()` straight out of the HTML, so there's
no second copy to drift.

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
