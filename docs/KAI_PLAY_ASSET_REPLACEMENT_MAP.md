# KAI PLAY — Existing → New Asset Replacement Map

Pass: P0 media fidelity only  
Decision date: 2026-08-26  
Implementation gate: **NO ELIGIBLE NEW P0 BATCH FOUND — PAGE UNCHANGED**

## Decision rule

An image can replace a live V4 layer only when it is:

1. recognizably a KAI PLAY asset rather than a visual reference or another product's media;
2. technically usable at 1440 desktop and 390/320 mobile without baking real UI state into pixels;
3. rights/provenance appropriate;
4. better than the current asset after crop, perspective, scale, alpha, and loading-budget checks.

No newly discovered file meets all four requirements for a P0 replacement.

## P0 mapping

| Priority / visual role | Current layer / selector | Candidate | Decision | Integration and physical relationship | Responsive / fallback | Evidence / rollback |
|---|---|---|---|---|---|---|
| P0 Hero table surface | `.live-table-shell`, `.live-table-felt` | `kai-felt-v4.avif` + desktop/mobile masks | **KEEP / COMBINE** | Felt image remains clipped by the responsive felt mask. DOM players, cards, state, and CTA remain above it. | Desktop uses 1200×680 masks; mobile uses 680×760 masks. Existing solid/gradient CSS remains fallback. | Already referenced at `styles.css:2341–2355`; rollback target is the prior CSS fallback, asset SHA `a5178d07…`. |
| P0 Hero padded rail / depth | `.live-table-shell::before`, `.live-table-rail` | `kai-leather-v4.avif` + outer/rail masks | **KEEP / COMBINE** | Leather provides material; SVG masks provide geometry. Existing inner highlights, elevation and ambient shadow preserve physical separation. | Separate desktop/mobile masks avoid destructive cropping. Existing graphite fill remains fallback. | Already referenced at `styles.css:2310–2332`; asset SHA `fe4ee9ba…`. |
| P0 Playing-card faces | `.poker-card`, `.game-card` and DOM ranks/suits | No eligible new KAI face asset. The 264×360 reference sheet is watermarked, low-resolution and non-transparent. | **KEEP (BLOCKED)** | Keep ranks/suits as DOM for game state and accessibility; keep `card-paper.svg` as material only. Do not rasterize dynamic hands into a static image. | Existing responsive card sizing/fan remains intact. | No change; rollback not needed. Required input: licensed/generated face system or individual face sprites. |
| P0 KAI card back | `.kai-card-back`, `.deal-card`, `.training-card-back` | No finished new back found | **KEEP (BLOCKED)** | Preserve current KAI SVG back so dealing motion, fan, overlap, z-index and dynamic counts remain DOM driven. | SVG scales cleanly at desktop and mobile. | Existing reference at `styles.css:1694`, `1950`; SHA `426fe840…`. |
| P0 Table geometry | desktop/mobile outer, rail and felt mask files | No complete transparent KAI hero-table cutout found | **KEEP** | Masks remain geometry only. They do not replace real table state or interaction. | Dedicated 1440/390 geometry already exists. | Six mask SHAs recorded in inventory. |
| P0 Material source masters | 1254² felt/leather PNGs | Current 720² AVIFs | **KEEP optimized derivative** | Do not swap 2.8 MB PNGs into runtime; AVIF retains material fidelity at a fraction of weight. | Tiled/background rendering avoids viewport-specific crops. | PNG masters remain outside runtime; AVIFs are 77.5 KB and 93.6 KB. |

## Reference and exclusion mapping

| Candidate group | Target it appears to suggest | Decision | Reason |
|---|---|---|---|
| Three physical/poker-table reference screenshots | Hero table | **REMOVE from runtime / REFERENCE only** | Full scenes have baked backgrounds, chairs, lighting, and third-party visual identity; no alpha and no safe responsive crop. |
| Four mobile poker/lobby screenshots | Lobby and real table | **REMOVE from runtime / REFERENCE only** | They demonstrate hierarchy and physicality but contain complete third-party UI, avatars, chips, and controls. |
| Three duplicate dark gaming collages | General game personality | **REMOVE** | Same bytes, small resolution, complete third-party layouts; redundant. |
| Watermarked playing-card index | Playing-card faces | **REMOVE** | Too small, cropped, watermarked, and not a usable sprite atlas. |
| XIAOYUE `felt-forest-2048.png` | Table felt | **REMOVE** | Separate product identity; 5.9 MB; no need because KAI felt is already present. |
| Five-colour material board | Brand palette | **REMOVE from runtime / REFERENCE only** | A swatch board is not a table, card, or texture asset. |

## DOM/media boundary preserved

The following remain live HTML/DOM and were not flattened into imagery:

- player nickname and seat state;
- online count, competitive score, room state and countdown;
- dynamic ranks/suits, hand count, played-card state and score;
- buttons, navigation, rules, game controls and API-backed state.

Only material and geometry files remain in the image layer.

## P0 acceptance result

- Contact Sheet: complete.
- Inventory: complete.
- Replacement Map: complete.
- P0 runtime replacements: **0**, because no eligible new P0 image was found.
- 1440 Before / After: **not produced**; an identical “After” would falsely imply a media upgrade.
- 390 Before / After: **not produced** for the same reason.
- Page/API/game logic/navigation/responsive code changed by this pass: **none**.
- P1: not started, as requested.

## Input needed to unlock the P0 implementation

Attach the missing KAI PLAY asset files or provide their absolute directory. At minimum, identify one or more of:

- finished card-face atlas or individual card faces;
- finished KAI card-back image;
- transparent or layerable hero-table render;
- separate felt/rail/table cutouts if they are intended to replace the current material-mask system.

Once present, the next pass can copy only approved media into `game/web/assets`, preserve DOM state, perform 1440/390/320 crop and perspective checks, and then produce real Before/After screenshots.
