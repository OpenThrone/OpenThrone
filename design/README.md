# Design file (FigCraft)

`design/openthrone.figcraft` is an editable design file of OpenThrone for
FigCraft, the open-source Figma-style editor. It is built
from the live alpha site, so it always shows what players see:

| FigCraft page | Contents |
| --- | --- |
| 01 — Public Site (Logged Out) | Home, About, How to Play, FAQ, News, Stats, Login, Register |
| 02 — Logged-In Game (Commander Shell) | Every main game page, as a logged-in commander |
| 03 — Reference Screenshots | Full-page screenshots of the same pages, for comparison |

Each element on a page becomes a real layer:

- **Frames** keep their fills, gradients, borders, corner radii, shadows and
  clipping. They are named from the code (`header`, `Paper`, `main-area`…).
- **Text** keeps its font (Inter, Chomsky, MedievalSharp), colour, spacing,
  bullets, gold gradient fills, and bold or link runs inside paragraphs.
- **Icons** become vectors (Font Awesome) or glyph text (RPG Awesome).
- **Artwork** (banners, parchment, hero art, avatars) stays as image layers.

Layers are positioned absolutely, as rendered at 1440×900. There is no auto
layout, and repeated pieces are not shared components.

The file and its captures are generated, so git ignores them.

## Rebuilding

```bash
OT_DESIGN_EMAIL=… OT_DESIGN_PASSWORD=… bun run design:sync
```

- `design:extract` (`scripts/design/extract-dom.ts`) opens each page in
  headless Chromium and writes layer trees, images and screenshots to
  `design/exports/`. It defaults to `https://alpha.openthrone.dev` (`--base` to
  change), refuses production, and blocks the dev-only react-scan toolbar and
  Next.js badge.
- `design:build` (`scripts/design/build-figcraft.ts`) turns those trees into
  FigCraft commands and runs them through `figcraft-cli`. It writes
  `design/openthrone.figcraft`.

Options:

- `--only home,overview` limits either step to those pages.
- `--public-only` / `--game-only` limits extraction to one side.
- `--creds <file>` reads the login from a JSON file instead of the
  environment, either `{ "email", "password" }` or the alpha harness format.

Logged-in pages need a disposable alpha test account. Without credentials only
the public pages are extracted. Explicitly requesting game pages without credentials
fails instead of silently skipping them.

Extraction writes `design/exports/manifest.json` only after every selected page and
screenshot succeeds. Starting another extraction invalidates that manifest; a
failed navigation, HTTP error or redirect to another route exits nonzero, so
`design:sync` stops before building. The builder requires a completed manifest,
matching capture IDs and screenshots for every selected page. It ignores old
captures outside that run and preserves the existing design file on failure.
Existing captures made before this validation was added must be extracted again.
A partial extraction (for example `--public-only --only home`) builds only those
captured pages; `design:build --only ...` can further narrow that completed run.

The page list lives in `scripts/design/pages.ts`. Add or remove a page there
when a player-facing page is added or removed.

Close the file in FigCraft before rebuilding, then reopen it.

## When to rebuild

After a change that alters what players see is merged into `alpha` and alpha is
deployed (see section 13 of `AGENTS.md`).

## Setup (once per machine)

- **FigCraft** AppImage, with `figcraft-cli` on the path at
  `~/.local/bin/figcraft-cli` (or set `FIGCRAFT_CLI`). A wrapper is enough:
  `exec <figcraft>.AppImage cli "$@"`.
- **Chromium** at `/usr/bin/chromium-browser` (or set `CHROME_PATH`), and
  `puppeteer-core` installed with `bun add -g puppeteer-core` (or set
  `PUPPETEER_CORE_PATH`). These are the same as `scripts/capture-audit.ts`.
- **ImageMagick** (`magick`), used to convert SVG/AVIF images and stretch
  images the page draws with `object-fit: fill`.
- **Fonts** in `~/.local/share/fonts`, then `fc-cache -f`. FigCraft needs TTF
  or OTF files; WOFF does not load.
  - `node_modules/@opendominion/rpg-awesome/fonts/rpgawesome-webfont.ttf`
  - MedievalSharp (Google Fonts)
  - Chomsky (the site loads it from cdnfonts.com as WOFF; convert it with
    fonttools: in a Python environment with `fonttools` installed, run
    `python -c "from fontTools.ttLib import TTFont; f=TTFont('Chomsky.woff'); f.flavor=None; f.save('Chomsky.otf')"`)
  - Noto Color Emoji is used to rasterise emoji (FigCraft can't draw colour
    emoji, so they are placed as small images).
