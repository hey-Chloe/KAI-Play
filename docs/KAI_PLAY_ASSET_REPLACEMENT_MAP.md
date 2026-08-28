# KAI PLAY — Existing → New Asset Replacement Map

Pass: P0 media fidelity + Card Material V11 + Fidelity V12<br>
Decision date: 2026-08-28<br>
Implementation gate: **V11 CARD STOCK ADOPTED — V12 SIZE-AWARE FIDELITY ACTIVE — LIVE DOM/SVG FACES PRESERVED**

## Decision rule

An image can replace a live material layer only when it is:

1. recognizably a KAI PLAY asset rather than a visual reference or another product's media;
2. technically usable at 1440 desktop and 390/320 mobile without baking real UI state into pixels;
3. rights/provenance appropriate;
4. better than the current asset after crop, perspective, scale, alpha, and loading-budget checks.

`kai-card-stock-6912c163.jpg` meets these requirements as a shared face material. It does not replace live rank/suit markup or the existing KAI card back; it is combined with them.

## P0 mapping

| Priority / visual role | Current layer / selector | Candidate | Decision | Integration and physical relationship | Responsive / fallback | Evidence / rollback |
|---|---|---|---|---|---|---|
| P0 Hero table surface | `.live-table-shell`, `.live-table-felt` | `kai-felt-v4.avif` + desktop/mobile masks | **KEEP / COMBINE** | Felt image remains clipped by the responsive felt mask. DOM players, cards, state, and CTA remain above it. | Desktop uses 1200×680 masks; mobile uses 680×760 masks. Existing solid/gradient CSS remains fallback. | Already referenced at `styles.css:2341–2355`; rollback target is the prior CSS fallback, asset SHA `a5178d07…`. |
| P0 Hero padded rail / depth | `.live-table-shell::before`, `.live-table-rail` | `kai-leather-v4.avif` + outer/rail masks | **KEEP / COMBINE** | Leather provides material; SVG masks provide geometry. Existing inner highlights, elevation and ambient shadow preserve physical separation. | Separate desktop/mobile masks avoid destructive cropping. Existing graphite fill remains fallback. | Already referenced at `styles.css:2310–2332`; asset SHA `fe4ee9ba…`. |
| P0 Playing-card face material | `.poker.poker-face` plus DOM ranks/suits/pips | `kai-card-stock-6912c163.jpg` combined with local J/Q/K/Joker SVGs | **ADOPT / COMBINE** | Use the JPEG only as warm card-stock surface. Keep ranks, suits, pips, ARIA and state in DOM; keep court/Joker art as local SVG. Never rasterize a dynamic hand into a static face sheet. | Full/Compact/Micro progressively reduce decorative detail while preserving the left index and `9:13` geometry. Solid warm-white and gradient remain fallback. | Asset SHA `6912c163…`; rollback removes the JPEG layer and restores `card-paper.svg`/warm-white fallback. Acceptance is defined in `KAI_PLAY_CARD_MATERIAL_V11.md`. |
| P0 KAI card back | `.kai-card-back`, `.deal-card`, `.training-card-back` | Existing `kai-card-back.svg` | **KEEP / REUSE** | Preserve one KAI SVG back so dealing motion, fan, overlap, z-index and dynamic counts remain DOM driven. V11 does not require a replacement bitmap. | SVG scales cleanly at desktop and mobile and shares the face `9:13` ratio. | Existing asset SHA `426fe840…`; rollback not required. |
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

## P0 acceptance result after V11

- Contact Sheet: complete.
- Inventory: complete.
- Replacement Map: complete.
- P0 card-face material: **1 adopted project asset**, `kai-card-stock-6912c163.jpg`.
- Dynamic face system: **kept**, including DOM ranks/suits/pips, semantic labels and local J/Q/K/Joker SVGs.
- KAI card back: **kept**, because the existing branded vector already meets the role.
- Required visual evidence: 1440×1000 lobby, 1280×720 live table, 390×844 phone, 844×390 landscape and 320×568 Micro checks.
- API/game rules/navigation: outside the media replacement boundary and must remain unchanged.

## Remaining optional inputs

No additional face atlas or card-back bitmap is needed to deliver V11. Future media should be supplied only when it clearly improves an existing role without flattening state. Optional candidates are:

- transparent or layerable hero-table render;
- separate felt/rail/table cutouts if they are intended to replace the current material-mask system.

Any later replacement must preserve DOM state, use approved media in `web/assets`, pass the V11 Full/Compact/Micro contract, and complete 1440/390/320 crop and perspective checks before adoption.
