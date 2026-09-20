# Signal Room design system

Dark-first "signal" aesthetic: off-black canvas, hairline structure, square chrome, mono
metadata, and four hue-only vertical accents. No web fonts, no UI framework, no icons beyond
plain glyphs.

Source of truth: `src/styles/theme.css` (tokens) and `src/styles/global.css` (primitives +
components). This document explains the rules and records measured contrast.

## 1. Principles

1. **Signal over decoration.** Structure comes from 1px hairlines and spacing, not shadows,
   gradients or rounded containers.
2. **Metadata is mono, prose is not.** The mono stack is reserved for metadata: timestamps,
   deltas, counts, source labels, tags, badges, micro-labels. Paragraphs, headlines and prose
   are always the proportional system stack.
3. **Hue carries the vertical.** The four verticals share one lightness/chroma pair per theme;
   only hue changes. A reader learns "amber = geopolitics" without a legend.
4. **Readable first.** Body copy is 16px with a 1.65 line height; measure stays at 68ch.
5. **Static and quiet.** System fonts, no layout shift, client JS under 10KB, reduced motion
   respected.

## 2. Color tokens

Named contract values (exact hex, both themes):

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--canvas` | `#0a0d12` | `#f6f7f9` | Page background |
| `--surface-1` | `#0e1218` | `#ffffff` | Cards, tiles, callouts |
| `--surface-2` | `#121722` | `#eef1f5` | Hover rows, popovers, code |
| `--hairline` | `rgba(255,255,255,.08)` | `rgba(10,13,18,.10)` | Row dividers, card borders |
| `--hairline-strong` | `rgba(255,255,255,.16)` | `rgba(10,13,18,.20)` | Section rules, input borders |
| `--text` | `#e8ecf1` | `#10151c` | Body and headline text |
| `--muted` | `#9aa4b2` | `#4b5563` | Secondary text, meta |
| `--overlay` | `rgba(5,7,10,.72)` | `rgba(246,247,249,.8)` | Modal backdrop, header blur |
| `--positive` / `--negative` | `#7fd497` / `#ff9c9c` | `#267543` / `#a4232b` | Deltas, warnings |

### Vertical accents (OKLCH, hue-only)

Accents are declared as OKLCH with a hex fallback via `@supports`, one lightness/chroma pair per
theme, four hues:

| Vertical | Hue | Dark (L .80 / C .12) | Light (L .50 / C .11) |
| --- | --- | --- | --- |
| AI | cyan 215 | `oklch(0.8 0.12 215)` → `#4cd1ee` | `oklch(0.5 0.11 215)` → `#00728a` |
| BIO | green 152 | `oklch(0.8 0.12 152)` → `#7fd497` | `oklch(0.5 0.11 152)` → `#267543` |
| GEO | amber 72 | `oklch(0.8 0.12 72)` → `#edb161` | `oklch(0.5 0.11 72)` → `#895700` |
| MARKETS | violet 295 | `oklch(0.8 0.12 295)` → `#c3aeff` | `oklch(0.5 0.11 295)` → `#68559b` |

`--accent` is the generic slot consumed by components; `data-vertical` on `<html>` (or on a
component) maps it to the vertical hue. Never hardcode a vertical hex inside a component.

### Measured contrast (WCAG 2.1, sRGB)

| Foreground | Background | Ratio | Result |
| --- | --- | --- | --- |
| `#e8ecf1` text | `#0a0d12` canvas | **16.40:1** | AAA |
| `#9aa4b2` muted | `#0a0d12` canvas | **7.72:1** | AAA |
| `#9aa4b2` muted | `#0e1218` surface-1 | 7.45:1 | AAA |
| `#e8ecf1` text | `#121722` surface-2 | 15.11:1 | AAA |
| AI `#4cd1ee` | canvas | 10.81:1 | AAA |
| BIO `#7fd497` | canvas | 10.90:1 | AAA |
| GEO `#edb161` | canvas | 10.25:1 | AAA |
| MARKETS `#c3aeff` | canvas | 10.02:1 | AAA |
| `#10151c` text | `#f6f7f9` canvas (light) | 17.09:1 | AAA |
| `#4b5563` muted | `#f6f7f9` canvas (light) | 7.05:1 | AAA |
| AI `#00728a` | light canvas | 5.19:1 | AA |
| BIO `#267543` | light canvas | 5.28:1 | AA |
| GEO `#895700` | light canvas | 5.72:1 | AA |
| MARKETS `#68559b` | light canvas | 5.83:1 | AA |

Every accent clears AA (4.5:1) for normal text in both themes; muted text clears AAA on both
canvases. Recompute with the same OKLCH → linear sRGB pipeline if any hue or L/C changes.

### Theme switching

1. `:root` holds dark tokens (default).
2. `:root[data-theme="light"]` holds explicit light tokens.
3. `@media (prefers-color-scheme: light) { :root:not([data-theme]) { … } }` handles system
   preference when the visitor has not chosen.
4. An inline no-flash script in `<head>` applies `localStorage['sr-theme']` before first paint.
   The toggle writes the same key and updates `aria-label` to describe the action.

## 3. Typography

| Token | Value | Use |
| --- | --- | --- |
| `--font-sans` | system stack (`-apple-system`, `Segoe UI`, Roboto, …) | All prose, headlines |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas` | Metadata only |
| `--fs-2xs` 11px | mono micro-labels, badges, citations |
| `--fs-xs` 12px | nav, dense meta |
| `--fs-sm` 13px | deks, dense rows |
| `--fs-base` 16px | body |
| `--fs-md` 17px | story body, row titles |
| `--fs-lg`–`--fs-3xl` | 21 / 26 / 34 / 44px, fluid via `clamp()` for page heads |

Micro-label recipe: `font-mono`, uppercase, `letter-spacing: .09em`, 11px, muted. Implemented as
`.sr-micro`; never apply it to a sentence or paragraph.

## 4. Space, layout, chrome

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px (`--sp-1` … `--sp-8`).
- Max width 1180px, page padding `clamp(16px, 4vw, 32px)`.
- Measure: 68ch prose, 78ch wide.
- `--radius: 0`. Cards, buttons, inputs, dialogs and chips are all square.
- Borders are 1px hairlines; sections are separated by `--hairline-strong`, rows by `--hairline`.
- Focus: 2px `--accent` outline with 2px offset via `:focus-visible` only.
- Motion: no transitions over 120ms; everything collapses under
  `prefers-reduced-motion: reduce`.

## 5. Components

Layouts: `BaseLayout` (skip link, header, main landmark, footer, palette, theme script).
Structure: `Header`, `Footer`, `SeoHead` (canonical, OG/Twitter, JSON-LD).
Content: `StoryCard`, `DenseIndexRow`, `TimelineView`, `TldrList`, `WhyItMatters`, `EditorNote`,
`ClusterLinks`, `CitationChip`.
Chrome: `TypeBadge`, `VerticalChip`, `CommandPalette`.

Home index row anatomy: `VI CHIP · HH:MM · N sources · N min` in mono, headline in sans, type
badge right-aligned. Cap is `HOME_INDEX_CAP` with an explicit "More" link — no infinite scroll.

## 6. Do / Don't

**Do**

- Use `--accent` + `data-vertical` for anything vertical-specific.
- Keep metadata in mono, uppercase micro-labels at 11px.
- Use 1px hairlines for structure; lean on whitespace for hierarchy.
- Give every external link `rel="noopener noreferrer nofollow"` and an accessible name.
- Keep citation chips resolvable: `body[].citations[]` must exist in `sources[].id`
  (enforced at build time).

**Don't**

- Don't set paragraphs, headlines or deks in mono.
- Don't add border radius, drop shadows beyond `--shadow-2` on overlays, or gradients.
- Don't introduce a second accent hue per vertical or a fifth vertical color.
- Don't use pure black `#000` or pure white text on dark surfaces.
- Don't add web fonts, icon fonts or third-party scripts.
- Don't ship client JS beyond the app bundle; the budget is 10KB uncompressed.

## 7. Accessibility checklist

- [x] Skip link to `#main`, `main` is focusable.
- [x] Landmarks: `header`, `nav[aria-label]`, `main`, `footer`, single `h1` per page.
- [x] `aria-current="page"` on the active nav item.
- [x] Keyboard: `Cmd/Ctrl+K` palette, `j`/`k` move through story rows, `o` opens the focused row.
- [x] Reduced motion honored (CSS + View Transition guard).
- [x] Contrast verified (table above).
- [x] External links announce that they open a new tab.

## 8. Performance budget

- Zero web fonts; system stacks only.
- Zero layout shift: no images above the fold, no late-injected layout, reserved widths on
  controls whose labels are set by script.
- Client JS: one bundle for theme, palette, search, keyboard nav and view toggles — measured in
  `dist/_astro/*.js`, target < 10KB uncompressed.
- CSS: two authored files, inlined or emitted by Astro depending on size.
