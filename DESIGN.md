# GATE-CBT Design System

Offline-first CBT exam simulator. Engage, remember, examine.

## 0. Research & Audit Log

- References loaded (frontend skill): `design/README.md` (system gate + routing), `redesign-skill.md` (audit-first workflow), `perfection/README.md` (performance/a11y doctrine), `interaction-skill.md` (motion mechanics discipline), `designpowers/lane-c` (accessibility + debt posture). Reference material distilled to tokens below; no brand assets copied.
- Audit findings (existing UI, from `style.css` + `index.html` + `app.js`): flat one-tone surfaces with no elevation recipe; accent used without glow or depth; missing `:active` press states on every control; no motion tokens and no `prefers-reduced-motion` rule (timer pulse runs forever regardless); no tabular numerals on data (timer alone had them); raw scattered px type sizes (11–30px, no scale); emoji-as-icon throughout the static shell (🧬 📜 🧮 ← ⭑ ✖ → 🟡); equal-visual-weight buttons with no primary/secondary hierarchy; result score-cards undifferentiated; tables unstyled beyond borders; hero with no atmospheric depth.
- Direction committed before tokens: a **quiet command center** — deep slate space with a restrained sky-blue glow. Signature material: the **Elevated Slate** card recipe (tonal gradient + hairline top-light rim + layered blue-tinted shadows). Signature moment: the **glowing primary button** and the lit accent active tab / current palette cell. Atmosphere: body-level radial sky glow over a faint slate grid.
- Skipped lanes: lazyweb screen-scraping and imagen drafts — the brief names the direction (Linear/Stripe-grade dark-modern over an existing slate/sky identity) and this is an offline extraction-and-refresh task, so embedded references + audit carry the direction.

## 9. Exam Modes

Three practice modes, selected on the config screen:

| Mode | Behavior | Determinism |
|------|----------|-------------|
| **Fixed Mock Test** (`fixed`) | Seeded paper per mock number — Mock Test 1..N (per-exam `mocks` in exams.js: XL 8, JAM 3, GAT-B 4, CUET 3). Identical every run, so a retake is directly comparable. Option display order is also seeded. | Fully deterministic: `seed = hashSeed("mock-" + code + "-" + set)` → `mulberry32`. Cache key `code:set:selOptions.join("-")` in the in-memory `FIXED_STORE`. Retry re-runs the same set. |
| **Random Full Exam** (`random`) | Official paper pattern, fresh `Math.random` draw every run (pre-3-mode behavior; default). | None. |
| **Unlimited Drill** (`unlimited`) | Endless shuffled pool (all sections mixed), one question at a time, instant right/wrong feedback + explanation, live ✓/✗/skip stats, no timer, no negative marks. Optional-section and practice checkboxes are hidden. Keyboard: 1–4 select, Enter next. `End Drill` shows a summary (correct / wrong / skipped / accuracy). | None (random pool order). |

Implementation notes (app.js):
- `mulberry32(seed)` — seeded 32-bit PRNG; `hashSeed(str)` — FNV-ish string → uint32.
- Per-question option-order shuffle: seeded with `(fixedSeed ^ Math.imul((i+1)*2654435761, 1)) >>> 0` in fixed mode so every question's option layout is stable per mock but varies across questions; `Math.random` otherwise. Exam and drill both render via `q.optOrder || ["a","b","c","d"]`; review keeps canonical a/b/c/d.
- Drill state lives in `S.drill`; `body.drill-mode` hides palette sidebar, nav rail, timer and submit; drill answer flow uses an `a.locked` flag with `correct-opt` / `your-wrong` option highlighting.
- History entries append ` · Mock N` for fixed-mode attempts.

## 1. Atmosphere & Identity

A quiet command center for serious prep. The app should feel like a well-lit instrument panel: dense where it needs to be (palette grid, section tabs), spacious where it does not (home, results), always calm. The signature is **muted depth** — surfaces read as softly-lit slate layers separated by tonal shifts, a hairline rim of top light, and blue-tinted shadows that echo the background rather than black ones. One sky-blue accent (the sky family of the existing identity) owns every interactive signal; semantic states (correct/wrong/marked/visited) keep their positional meaning via the established palette-dot language, which is never renamed or re-mapped.

## 2. Color

All neutrals are slate-hue-tinted (one gray family). One accent family. Semantics keep their meaning everywhere.

### Core tokens (MUST survive — referenced by `style.css` contract)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0f172a` | Page background |
| `--panel` | `#1e293b` | Card surfaces at rest |
| `--panel-2` | `#263449` | Raised/interactive fills (option rows, keypads, chips) |
| `--line` | `#334155` | Default borders, dividers |
| `--text` | `#e2e8f0` | Primary text |
| `--muted` | `#94a3b8` | Secondary text |
| `--accent` | `#38bdf8` | Interactive accent (sky family) |
| `--green` | `#22c55e` | Answered / correct |
| `--red` | `#ef4444` | Wrong / destructive text |
| `--amber` | `#f59e0b` | Visited / caution |
| `--purple` | `#a78bfa` | Marked-for-review |
| `--blue` | `#3b82f6` | Not-visited / info |

### Extended tokens (added for depth / hierarchy)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#0a1120` | Deep wells (calculator body, display) |
| `--panel-3` | `#2d3b52` | Hover-elevated surfaces, hover fills |
| `--line-soft` | `rgba(148,163,184,.14)` | Subtle inner separators |
| `--line-inset` | `rgba(255,255,255,.055)` | Top-light rim inside cards |
| `--on-accent` | `#04121f` | Text/ink on accent and filled cells |
| `--accent-2` | `#7dd3fc` | Accent highlight (hover) |
| `--accent-deep` | `#0ea5e9` | Accent depth (press) |
| `--accent-tint` | `rgba(56,189,248,.10)` | Accent-tinted fills |
| `--accent-ring` | `rgba(56,189,248,.45)` | Focus rings, current-cell rings |
| `--accent-glow` | `rgba(56,189,248,.22)` | Button glow |
| `--green-tint` | `rgba(34,197,94,.12)` | Correct fills |
| `--red-tint` | `rgba(239,68,68,.12)` | Wrong fills |
| `--red-deep` | `#c62f2f` | Destructive button fill (white text ≥ 4.5:1) |
| `--amber-tint` | `rgba(245,158,11,.14)` | Caution fills |
| `--purple-tint` | `rgba(167,139,250,.13)` | Marked fills |
| `--blue-tint` | `rgba(59,130,246,.20)` | Not-visited palette cells |
| `--shade` | `rgba(2,6,23,.5)` | Shadow ink (blue-tinted, per redesign audit) |

### Rules
- Accent is used for interactive/stateful signals only, never decoration.
- A color enters code only by going through this table first.
- Semantic meaning is position-and-color bound (green answered / purple marked / amber visited / blue untouched / red wrong) and must never be re-mapped.

## 3. Typography

Offline constraint: system font stack only. No webfonts, no CDNs. Tabular numerals on all data.

- Stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

### Scale (tokens, used verbatim in CSS)

| Token | Size | Weight | Line-height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| `--fs-display` | `clamp(28px, 1.7rem + 2.4vw, 40px)` | 800 | 1.12 | `-0.02em` | Home hero heading |
| `--fs-3xl` | `28px` | 800 | 1.2 | `-0.02em` | Timer, score big values |
| `--fs-2xl` | `22px` | 700 | 1.25 | `-0.01em` | Screen titles (config/result/review) |
| `--fs-xl` | `19px` | 700 | 1.3 | `0` | Brand, card titles |
| `--fs-lg` | `16px` | 500 | 1.6 | `0` | Question text |
| `--fs-md` | `15px` | 400 | 1.55 | `0` | Body base |
| `--fs-sm` | `13.5px` | 400 | 1.5 | `0` | Secondary info, facts |
| `--fs-xs` | `12px` | 500 | 1.4 | `0.01em` | Chips, captions, mini-buttons |
| `--fs-2xs` | `11px` | 600 | 1.3 | `0.08em` | Overline table headers, legend, section tabs |

Weight steps in use: 400 / 500 / 600 / 700 / 800. Numeric data (`timer`, score cards, tables, palette numbers): `font-variant-numeric: tabular-nums`.

### Rules
- Body text never below `--fs-xs` for meaningful content; captions may use `--fs-2xs`.
- Headings wrap balanced (`text-wrap: balance`), paragraphs use `text-wrap: pretty` where supported.
- Two visual families only: sans UI + a mono-flavored feel achieved via tabular numerals (no second font loaded — offline).

## 4. Spacing & Layout

Base unit **4px**.

| Token | Value | Usage |
|-------|-------|-------|
| `--sp-1` | 4px | Icon-to-label gutter |
| `--sp-2` | 8px | Inline groups, tab gaps |
| `--sp-3` | 12px | Chip/legend gaps, compact padding |
| `--sp-4` | 16px | Card padding (compact), section gaps |
| `--sp-5` | 20px | Default card padding, control bars |
| `--sp-6` | 24px | Generous card padding, section separation |
| `--sp-8` | 32px | Between major blocks |
| `--sp-10` | 40px | Page-vertical rhythm |

Radii (tighter inside, softer outside): `--r-sm: 6px` (palette cells, keypad keys), `--r-md: 10px` (buttons, inputs, option rows, tabs), `--r-lg: 14px` (cards, panels), `--r-xl: 18px` (hero focal, primary confirm cards), `--r-pill: 999px` (chips, badges, legend dots).

Layout grammar:
- Max widths: home 1200px, exam 1400px, config 720px, result 860px, review 900px — screens center on `max-width` with auto margins.
- Exam body: `grid-template-columns: 1fr 340px`; collapses to 1 col with the sidebar (palette) **above** the question at `≤ 980px` (exam-standard behavior, preserved).
- Exam-card grid: `repeat(auto-fit, minmax(260px, 1fr))`, gap 16px.
- Primary breakpoints: `≤ 980px` exam layout, `≤ 640px` and `≤ 480px` mobile refinements. Targets 375–430px as primary.

## 5. Components

Reusable primitives (all states documented; class hooks preserved verbatim from the app contract).

### Surface / Card (Elevated Slate — the signature material)
- **Structure**: any block in `--panel` with 1px `--line` border, top-light rim, layered tinted shadow.
- **Recipe**: `background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,0) 46%) var(--panel); border: 1px solid var(--line); box-shadow: inset 0 1px 0 var(--line-inset), 0 1px 2px var(--shade), 0 10px 24px -12px rgba(2,6,23,.55);`
- **Used by**: `.exam-card`, `.config-card`, `.home-note`, `.history-panel`, `.side-block`, `.score-card`, `.rev-item`, `.question-area`.
- **States**: rest (above) → hover (cards that navigate): `translateY(-3px)`, border → accent, shadow deepens. press (`.exam-card:active`): `translateY(-1px)`.
- **Motion**: transform+border+shadow over `--dur-fast`–`--dur-med`.

### Button
- **Structure**: `<button class="btn[ ghost| danger| back]">`, inline-flex, icon+label.
- **Spacing**: padding `--sp-2`/`--sp-4`, gap `--sp-1`, min-height 44px, radius `--r-md`.
- **Primary** (`.btn`): accent fill, `--on-accent` ink, `box-shadow` glow `0 0 0 1px var(--accent-ring), 0 4px 14px -4px var(--accent-glow)`; hover → `--accent-2` fill; active → `translateY(1px) scale(.985)` + reduced glow; disabled → `opacity .45`, `cursor: not-allowed`.
- **Ghost** (`.btn.ghost`): transparent fill, 1px `rgba(56,189,248,.4)` border, accent ink; hover → `--accent-tint`; active → scale. Used for back links, secondary actions.
- **Danger** (`.btn.danger`): `--red-deep` fill, white 600 ink, soft red glow; hover lighten; active scale. Used for End Test & Submit.
- **Sizes**: default (all of the above); mini (history panel buttons: `--fs-xs`, height 30px).
- **Focus**: `:focus-visible` 2px accent ring offset 2px.
- **Motion**: transition on background/color/border/shadow @ `--dur-fast`; press scale spring `--ease-spring`.

### Icon (inline SVG, class `.ic`)
- 24×24 viewBox, `1.75` stroke, `none` fill, `round` caps/joins, `currentColor`; sized `1em` in text flow, `22px` in brand, `18px` in nav buttons. No emoji as icons anywhere.

### Brand mark
- 24×24 inline SVG (DNA-monogram: two sine strokes + rungs), gradient accent stroke, sits beside brand wordmark. No external asset.

### Chip
- `.chip` pill: `--panel-2` fill, 1px `--line` border, `--fs-xs`, radius `--r-pill`, padding `2px 10px`. Type variants: `.type-mcq` blue text, `.type-msq` purple text, `.type-nat` green text.

### Table (`.sec-table`, history table)
- Shared recipe: `border-collapse: separate; border-spacing: 0;` radius `--r-lg` on the panel; header row = `--panel-2` with `--fs-2xs` uppercase overline, `--muted` ink; body rows border-bottom `--line-soft`; row hover `--panel-3`. Numeric cells tabular-nums. Horizontal scroll (`overflow-x: auto`, `white-space: nowrap`) inside panel on narrow screens.

### Palette button
- 36px cells (exam-standard density — accepted debt, see §8), radius `--r-sm`, 1.5px border, `--fs-sm` 600 tabular.
- `answered`: green fill, `--on-accent` ink, green border + `0 0 0 1px var(--green-tint)` glow.
- `answered.marked`: green fill + 2px purple ring (`rgba(167,139,250,.55)`), both signals visible.
- `marked`: purple fill, `--on-accent` ink, purple border.
- `visited`: amber fill, `--on-accent` ink, amber border.
- `untouched`: `--blue-tint` fill, blue border, `--text` ink.
- `current`: `box-shadow: 0 0 0 2px var(--accent), 0 0 12px -2px var(--accent-glow)`, `scale(1.05)`.
- Press: `scale(.94)` spring. Hover on non-filled states: border → accent.

### Section tab (`.section-tabs button`)
- Pill `--fs-2xs` 600, `--r-md`; inactive `--panel-2` + `--line` + `--muted`; hover border accent; `active` = accent fill + `--on-accent` + glow (matches primary-button glow).

### Option row (`.opt`)
- Row label: `--panel-2` fill, 2px `--line` border, `--r-md`, padding `12px 14px`, key is tabular accent `--fs-md` 700.
- Hover: border accent. `selected`: green border + `--green-tint` + 1px inner glow; input accent-color `--green`.
- Review states: `.correct-opt` green border + tint; `.your-wrong` `--red` border + `--red-tint`. `.rev-item .opt` cursor default.

### Score card
- Elevated Slate. `.big` = `--fs-3xl` tabular 800; default ink accent; `.good` big green + `--green-tint` wash; `.bad` big `--red` + `--red-tint` wash. `.lbl` `--fs-xs` `--muted` overline.

### Exam card
- Elevated Slate card in a grid. `h3` `--fs-xl`, `--accent` ink. `.org` `--fs-sm` `--muted`. `.facts span` = chips (pill, `--panel-2`). `.tag` `--fs-xs` green 600. Hover lift per §5 Surface; press compress.

### Legend / dots (`.dot`)
- 11px rounded-square (3px radius) with `inset 0 0 0 1px rgba(2,6,23,.35)` for definition; colors per semantics (answered/revisited/visited/untouched).

### Timer
- `.timer`: `--fs-3xl` 800 tabular accent. `.timer.warn`: red ink + `animation: pulse 1s` opacity pulse (semantic only) — inert under reduced motion.

### Calculator (classes owned by `calc.js` — never renamed)
- Well `.calc`: `--bg-deep` fill, `--line` border, `--r-lg`. `.disp`: near-black well (`--bg-deep` + inset shadow), tabular `--fs-xl`. `.keys`: 6-col grid, key rows = Elevated-Slate mini buttons; `.fn` amber ink, `.op` accent ink, `.eq` accent fill.

### Coverage line (`.coverage .ok/.bad`, `.checkbox-row`, `.start-row`, `.pat`, `.opt-group label`)
- `.pat` `--fs-sm` `--muted` pre-line. Option-group labels = option-row grammar (disabled → `opacity .45`). Coverage state lines: ok = green, bad = `--red`, `--fs-xs`.

### Instant feedback (`.instant-fb.correct/.wrong`)
- Tinted fill (`--green-tint`/`--red-tint`) + semantic ink, `--r-md`.

### Nav rail
- Flex, centered, wrap; buttons from §5 Button; Prev/Clear rendered as ghost (secondary), Mark/Next as primary accent — hierarchy via CSS id overrides (`#btn-prev`, `#btn-clear` secondary; `#btn-mark`, `#btn-next` primary; `#btn-mark` min-width stable against label swap).

## 6. Motion & Interaction

Every motion is a state/affordance signal. No decorative animation on non-interactive elements.

| Token | Value | Usage |
|-------|-------|-------|
| `--dur-fast` | `120ms` | Press, hover tint, focus, palette cell |
| `--dur-med` | `220ms` | Card lift, tab switch, screen entry |
| `--dur-slow` | `340ms` | Calculator open, panel emphasis |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | All hover/enter entrances |
| `--ease-inout` | `cubic-bezier(.65,0,.35,1)` | Cross-fades |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Press scale feedback |

Rules:
- **GPU-composited properties only**: `transform`, `opacity`, `filter`. Never `width/height/top/left/margin/padding` animation.
- Screen entry: `.screen.active` fades up (`opacity 0→1`, `translateY(6px)→0`, `--dur-med` `--ease-out`) — signals navigation state.
- Button press: inverse scale via `--ease-spring` (interruptible retargetable feel).
- Card hover/elevate: transform lift + border/shadow tint.
- Timer warn: 1s opacity pulse (urgency signal), faded at reduced motion.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` collapses every `animation`/`transition` duration to `0.01ms` and removes hover lifts.

## 7. Depth & Surface

**Strategy: mixed — tonal shift + borders + blue-tinted shadows**, committed below.

| Level | Recipe | Usage |
|-------|--------|-------|
| Base | `--bg` + body atmosphere (top radial sky glow + faint 32px slate grid, `body::before`) | Page |
| Raised | Elevated Slate recipe (§5) | All cards |
| Hovered | Same + `--panel-3`/accent border + deeper shadow + `translateY(-3px)` | Navigable cards |
| Glowing | Accent/green/red tint wash + matching glow ring | Primary buttons, fills, current cell |
| Well | `--bg-deep` + inner inset shadow | Calculator, display, deep fields |

Light source: consistent top-center (rim light on top edge of every surface, shadows cast downward). No pure-black shadows anywhere (per audit); all shadow ink is `--shade` blue-tinted.

## 8. Accessibility Constraints & Accepted Debt

### Constraints
- WCAG target **2.1 AA**. Contrast floors: body 4.5:1, large text/borders-of-text 3:1, filled controls ≥ 3:1 with 4.5:1 for control text. Verified anchors: `--text` ~14:1, `--muted` ~7:1, accent-on-bg ~7.5:1, `--on-accent` on accent ~11:1, white on `--red-deep` > 4.5:1, filled palette cells use `--on-accent` ink (fixes previous white-on-purple failure).
- Focus-visible ring on every interactive element (`outline: 2px solid var(--accent); outline-offset: 2px`); NAT input uses border + ring focus.
- Primary actions ≥ 44px (all `.btn`, start, submit, nav rail).
- Android/WebView: `-webkit-text-size-adjust: 100%`, `env(safe-area-inset-*)` padding on `.screen`, `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`, `user-select: none` on interactive chrome, no-zoom viewport (HTML).
- Reduced motion respected globally (§6).
- Alerts remain `confirm()`/status-line based (no inline redesign of app.js messaging — out of scope, tracked as debt).
- Palette & palette-dot semantics are position-independent (color + shape + legend) and never re-mapped.

### Accepted debt
| Item | Location | Why accepted | Owner / exit |
|------|----------|--------------|--------------|
| Palette buttons ~36px, section tabs ~30px, legend and history mini-buttons below the 44px guideline | `#palette button`, `.section-tabs button`, `.legend`, history mini `.btn` | Real-CBT density convention — the exam grid must fit ~100 cells on a 375px screen; raised touch targets would break the palette | Must revisit only if a user-study flags it; overlaying the palette with a zoom mode is the exit |
| Timer warn pulse color-only (red + fade) rather than layout/inversion | `.timer.warn` | GPU-compressed; avoids layout motion in the header | None |
| Alert/status messaging stays as `confirm()`/status lines | config coverage, submit | JS behavior is sacred per project rule — no logic changes allowed | Contributor handles copy in a future pass |
| `position: relative` stacking on `body` for the atmosphere layer | `body::before` | CSS-only, no extra elements; fixed pseudo-layer | None |