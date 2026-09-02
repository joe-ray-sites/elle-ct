# ElleCT

A local web app for drilling ACT questions a few at a time instead of sitting
full practice tests. You feed it old tests; it feeds you questions back, tells
you what you got wrong and why, and tracks how far you are from your goal score.

Everything lives in your browser's storage on this machine. Nothing is uploaded.

**Live:** https://joe-ray-sites.github.io/elle-ct/

## Running it locally

```bash
node server.js
```

- http://localhost:5173 — the landing page (`index.html`)
- http://localhost:5173/app.html — the app itself

It has to be served rather than opened as a file, because the app is split into
ES modules. The local server mirrors the deployed layout exactly: `index.html`
is the landing page and `app.html` is the app, so links behave the same in both
places. `server.js` is a dev convenience only — GitHub Pages serves the static
files directly and never runs it.

## Deploying

Pushing to `main` publishes to GitHub Pages automatically; a build takes about
a minute. GitHub Pages serves CSS and JS with a ~10 minute cache, and browsers
can hold ES modules even longer, so **when you change CSS or JS, bump the
`?v=` everywhere** — the `<link>` and `<script>` tags in `index.html` and
`app.html`, and the `import … from './x.js?v=N'` specifiers inside `js/`.
Otherwise returning visitors run a mix of old and new modules. `.nojekyll` is there so Pages serves the files as-is rather than
running them through Jekyll.

## The mark

`assets/logo.svg` — an ACT answer bubble with a check breaking out of it, on a
gradient tile, with two bits of confetti. The name is a pun worth using: you
*elect* the right answer. It's drawn to survive being small — the silhouette
still reads at 16px in a browser tab, which is where a logo actually spends
most of its life. Inlined in both pages' headers so it costs no request, and
used directly as the favicon.

## Design

Mobile-first: every rule in `css/styles.css` is the phone layout, and
`min-width` queries add desktop affordances on top. Tokens live in
`css/tokens.css` — one file that both the app and the landing page import.

The token layer isn't a framework; it borrows the specific thing each
best-in-class system does well:

| Source | What was taken |
|---|---|
| [Material 3](https://m3.material.io/) | Role-based semantic tokens (`--surface-2`, `--text-muted`, `--primary-ink`) rather than raw color names, so a theme swap is a token swap |
| [IBM Carbon](https://carbondesignsystem.com/) | In dark mode surfaces get *lighter* as elevation rises; in light mode they get darker — the same elevation ladder reads correctly in both |
| [Atlassian](https://atlassian.design/) | Dark surfaces combine a lifted surface *with* a soft shadow instead of maximizing contrast, which is fatiguing over a long session |
| [Adobe Spectrum](https://spectrum.adobe.com/) | Touch platforms scale up ~1.25×: controls are 48px on mobile, 40px on pointer devices, and the type scale moves with them |
| [GOV.UK](https://design-system.service.gov.uk/) | Accessibility as a constraint: 44px minimum tap target, 8px minimum separation, visible focus ring on every surface |

Mobile-web specifics that are load-bearing, not decoration:

- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding, so the layout
  reaches under the notch without putting controls under the home indicator
- **16px minimum font size on every input** — anything smaller makes iOS Safari
  auto-zoom the moment a field is focused
- no `maximum-scale`; pinch-zoom stays available
- a thumb-reachable bottom tab bar on phones that becomes inline header tabs at
  760px; five tabs is the comfortable maximum, so the rest live behind *More*
- the drill's action row sticks to the bottom of the viewport — the buttons your
  thumb needs never scroll away
- `prefers-reduced-motion` disables every transition and animation
- theme follows the OS by default; the header toggle cycles auto → light → dark

One non-obvious trap worth recording: `backdrop-filter` creates a containing
block for fixed-position **descendants**. The frosted header therefore puts its
blur on a `::before` pseudo-element rather than on itself, otherwise the fixed
bottom tab bar gets pinned to the header instead of the viewport.

## The landing page

`index.html` — the hero demo is three real ACT-style questions you can
actually answer, with the same right/wrong states and the same
explain-the-miss feedback the app gives. Nobody has to imagine what the product
does. Below it: a proof strip, three steps, a bento feature grid, the privacy
note, and a closing CTA. Content reveals on scroll with an observer that fires
a screen early and a timeout that reveals everything regardless — a blank card
is worse than an un-animated one.

## The tabs

**Import** — drop in a PDF, a `.txt`, a `.csv`, or paste text straight from an
old test. The parser pulls out numbered questions, their A–D / F–J / A–E / F–K
choices, and any passages above them. Paste the answer key separately (any
format — `1. A  2. J  3. C` works) and it maps onto the questions by number. If
the source has written explanations (`12. The correct answer is F because…`)
those get attached too. Preview before saving, fix anything later from Library.

Real ACT booklets — including the *My Answer Key* booklet ACT sends after a
test — import in one drop. The importer reads the section headers (ENGLISH
TEST, MATHEMATICS TEST …) so every question lands in the right section with
per-section numbering; finds the scoring keys printed at the back and applies
them, tagging every question with its official ACT reporting category
(`conventions-of-standard-english`, `functions`, `interpretation-of-data` …);
and reads the form's own raw-to-scale conversion table, which then drives the
score estimates for those questions instead of the generic approximation.

Text extraction can't carry figures, tables, or equations, so every question
also keeps an image of the page it came from. In a drill, Math and Science
questions open with the page shown; other sections keep it a tap away. Tap the
page to zoom. The images live in the browser database like everything else.

Scanned PDFs with no text layer can't be read — the app tells you so rather
than silently importing nothing.

**Study** — pick subjects, sources, tags, how many questions, and whether you
want a per-question clock at real ACT pace. Modes:

- *Smart mix* — spaced repetition. New questions and ones that are due, weighted
  toward what you keep missing. Boxes advance 10min → 1d → 3d → 7d → 16d → 35d.
- *Weak spots* — only questions you're below 80% on
- *Unseen*, *Flagged*, *Pure random*

Keyboard: `A`–`K` to answer, `Enter` for next, `S` skip, `F` flag, `E` explain.

**Coach** — reads your actual attempt history and names the habits costing you
points: leaning on NO CHANGE, picking the longest answer when unsure, misses
that are your fastest answers (rushing) or your slowest (grinding), accuracy
dropping after a miss, missing the same question twice, fading late in a set.
Each one comes with what to do instead. Below that, the full strategy tip deck,
filterable by section.

Every miss during a drill gets an explanation automatically:

1. the explanation from your imported material, if there was one
2. otherwise Claude writes one, if you've added an API key
3. otherwise rule-based feedback plus the tips matched to that question's tags

The API key is optional. Paste an Anthropic key on the Coach tab and it's stored
in this browser's localStorage only — it goes to `api.anthropic.com` and nowhere
else. Explanations Claude writes are saved onto the question, so you only pay
for each one once. Without a key you still get 2 and 3.

**Goals** — set a target composite, per-section targets, and your test date.
Log the real practice tests you've taken (type them, or paste lines like
`2026-03-14, Practice 74C, 23, 21, 25, 22`, or a score report with
`English 27 Math 24 …`). You get:

- a progress chart with a line per section, your goal line, and a projection to
  test day based on your actual rate of improvement
- points to go, % of the way from baseline to goal, days left, pts/week
- section gaps in the only unit that matters: *how many more questions you need
  to get right in each section*

**Stats** — accuracy overall and per section (with the estimated scaled score),
day streak, time spent, your 15 worst questions, and a 14-day activity strip.

**Prompts** — writing prompts with a 40-minute clock and a draft that saves as
you type.

**Library** — search everything, fix a mis-parsed question, add a missing
answer, retag, delete. Export a full backup as JSON and drop it back into
Import to restore.

## A note on the score estimates

The raw→scaled conversion tables are approximations of published ACT charts;
the real curve moves a point or two per test form. And drill accuracy runs
optimistic — it's untimed and includes questions you've already seen. Logged
practice-test scores are what the progress line actually uses; the drill
estimate is only a fallback when you haven't logged any.

## Files

| | |
|---|---|
| `index.html`, `js/landing.js`, `css/landing.css` | landing page + its live hero demo |
| `app.html` | the app shell |
| `css/tokens.css` | the design system: color roles, type scale, spacing, motion |
| `css/styles.css` | app layout, mobile-first |
| `js/parser.js` | test text → questions, passages, answer keys, auto-tags |
| `js/coach.js` | tip deck, miss diagnosis, Claude explanations |
| `js/scoring.js` | raw↔scaled conversion, goal math, progress chart |
| `js/db.js` | IndexedDB wrapper |
| `js/app.js` | views, drill engine, spaced repetition |
| `samples/` | a short English passage + key to try the importer on |
