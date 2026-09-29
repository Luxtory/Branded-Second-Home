---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail.

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

## Project Design System (if any)

**Luxtory Design System — this section OVERRIDES the generic guidance above** (in this project do NOT
"vary fonts/themes between generations" or invent a new aesthetic: the direction is fixed). Full contract:
`docs/specs/design-system.md` · normative usage: `docs/reference/design-system.md` · code: `src/design-system/` ·
visual QA: `src/design-system/lab/index.html`.

- **Thesis — LUXTORY = LUXURY + STORY.** LUXURY ("a Planta"): architectural grid, proportion, hairlines,
  dimension lines, space, photography in fixed-ratio Frames. STORY ("o Roteiro"): Scenes in sequence, Scene
  Markers with *real* metadata (place · time · light · chapter), captions that change how the image reads.
  Grammar: Opening Frame · Chapter · Scene · Scene Marker · Frame · Sequence · Evidence.
- **Palette (immutable):** Moroccan Blue `#0F4E67`, Dark Moroccan Blue `#003D52`, Warm Sand `#CDAD8E`,
  Dark Warm Sand `#9E8567`, Pure White `#FFFFFF`. Paper-first: white dominates, Dark Moroccan is the ink,
  Warm Sand is light (hairlines, markers, action on night). Warm Sand is **never** text on white (2.11:1).
  Derived functional only: sand-wash `#F7F2ED`, error `#9B2226` / `#F2B8B5` (night).
- **Grounds:** `data-ground="paper | wash | night"` re-scopes all `--lx-color-*`; components never pick colors.
  Grounds follow the narrated time of day (dia → fim de tarde → noite).
- **Typography (all free, SIL OFL, self-hosted):** Display **Newsreader** (opsz 72) for Opening Frames,
  headlines, Concept names — max one `<em>` italic "story turn" per headline. Utility **Hanken Grotesk** for
  body, nav, forms, Evidence. Story **Courier Prime** ONLY for Scene Markers, chapters, place/time and
  captions — max 1 marker per Scene, never body/labels/buttons, `INT.`/`EXT.` only on Opening Frames with real photos.
- **Tokens & code:** single source `src/design-system/tokens/tokens.json` (DTCG) → generated `tokens.css`.
  Import `src/design-system/styles/index.css`; compose `lx-*` classes (BEM; states via ARIA/HTML attributes).
  No literal color, font-family, duration, easing or z-index outside tokens (enforced by
  `node --test src/design-system/scripts/*.test.mjs`). After W0, React components are thin wrappers over `lx-*`.
- **Visual rules:** radius 0; 1px hairlines; one shadow (overlays only); no glassmorphism, glow, decorative
  gradients, boxed/shadowed cards, stock photos posing as the property, lorem ipsum. Without official photos use
  `lx-frame--typographic`. Text over images: white only, on a Dark Moroccan scrim ≥ 68%. Collection = curated,
  asymmetric sequence, not a uniform grid. Mobile is designed (full-bleed Frames, 4:5 establishing, fullscreen
  dialog menu with pinned CTA), never a compressed desktop.
- **Copy:** short, concrete scenes, pt-BR via i18n. Co-Owner = **Ação** with **Direito de Uso**; never "cota"
  (or derivatives) nor "diária(s)"; no price per day for Co-Owner; never promise return, appreciation,
  liquidity or income (REQ-100, REQ-101). Interest ≠ acquisition (BR-050); days are a preference (REQ-025).
- **Communication (public pages):** positioning, narrative, tone, proof and CTAs come from the approved communication
  layer (`docs/specs/communication.md` + `docs/specs/communication/`), never invented per page. One Protagonist per
  page; B2C and Brand Partners journeys never link to each other; facts only from 01/02/03 by ID; only approved
  decisions. The page brief lives in the wave spec. The Lab's copy is demo content, never a source.
- **Accessibility baseline:** WCAG 2.2 AA — visible 2px focus ring per ground, contrast verified by test,
  targets 44px (controls 48px), errors with icon + text, `prefers-reduced-motion` + `data-motion="reduce"`
  honored, no auto-motion > 5s, no horizontal scroll 320–1920px.
- **Logo:** official kit (received 2026-09-25), verbatim, via `src/design-system/brand/logo/manifest.json` keys
  (`horizontal|vertical|icon` × `moroccan-blue` on paper/wash, `warm-sand` on night). Always `<img>`/`<picture>`,
  never inline SVG (blend modes erase the wordmark on light grounds); clear space = half the logo height; icon below
  360px viewport; never recolor/filter; never styled text as a logo. Rules: `src/design-system/brand/logo/README.md`.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
