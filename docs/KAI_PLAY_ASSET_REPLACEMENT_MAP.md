# KAI PLAY — Existing → New Asset Replacement Map

Pass: P0 media fidelity + Card Material V11 + Fidelity V12 + Licensed Face Art V13<br>
Decision date: 2026-08-28<br>
Implementation gate: **V11 CARD STOCK ADOPTED — V12 SIZE-AWARE FIDELITY ACTIVE — V13 CC0 COURTS/JOKERS ACTIVE — LIVE DOM FACES PRESERVED**

## Decision rule

An image can replace a live material layer only when it is:

1. recognizably a KAI PLAY asset rather than a visual reference or another product's media;
2. technically usable at 1440 desktop and 390/320 mobile without baking real UI state into pixels;
3. rights/provenance appropriate;
4. better than the current asset after crop, perspective, scale, alpha, and loading-budget checks.

`kai-card-stock-6912c163.jpg` meets these requirements as a shared face material. The 14 V13 vectors under `web/assets/cards` meet the same rule as locally stored, content-hashed CC0 derivatives with exact provenance: 12 J/Q/K illustrations preserve suit-specific English-court artwork, while two Atlas derivatives make the big and small Jokers visually distinct. None replaces live rank/suit markup or the existing KAI card back; all are combined with them.

## P0 mapping

| Priority / visual role | Current layer / selector | Candidate | Decision | Integration and physical relationship | Responsive / fallback | Evidence / rollback |
|---|---|---|---|---|---|---|
| P0 Hero table surface | `.live-table-shell`, `.live-table-felt` | `kai-felt-v4.avif` + desktop/mobile masks | **KEEP / COMBINE** | Felt image remains clipped by the responsive felt mask. DOM players, cards, state, and CTA remain above it. | Desktop uses 1200×680 masks; mobile uses 680×760 masks. Existing solid/gradient CSS remains fallback. | Already referenced at `styles.css:2341–2355`; rollback target is the prior CSS fallback, asset SHA `a5178d07…`. |
| P0 Hero padded rail / depth | `.live-table-shell::before`, `.live-table-rail` | `kai-leather-v4.avif` + outer/rail masks | **KEEP / COMBINE** | Leather provides material; SVG masks provide geometry. Existing inner highlights, elevation and ambient shadow preserve physical separation. | Separate desktop/mobile masks avoid destructive cropping. Existing graphite fill remains fallback. | Already referenced at `styles.css:2310–2332`; asset SHA `fe4ee9ba…`. |
| P0 Playing-card face material | `.poker.poker-face` plus DOM ranks/suits/pips | `kai-card-stock-6912c163.jpg` | **ADOPT / COMBINE** | Use the JPEG only as warm card-stock surface. Keep ranks, suits, pips, ARIA and state in DOM; never rasterize a dynamic hand into a static face sheet. | Full/Compact/Micro progressively reduce decorative detail while preserving the left index and `9:13` geometry. Solid warm-white and gradient remain fallback. | Asset SHA `6912c163…`; rollback removes the JPEG layer and restores `card-paper.svg`/warm-white fallback. Acceptance is defined in `KAI_PLAY_CARD_MATERIAL_V11.md`. |
| P0 J/Q/K center artwork | `.card-court` selected by semantic `data-rank` + `data-suit` | 12 `assets/cards/kai-court-{j,q,k}-{suit}-*.svg` derivatives from Adrian Kennard's CC0 Standard deck | **ADOPT / REPLACE legacy generic art** | Crop each full source card to its court center while leaving rank, suit, paper and interaction in live DOM/CSS. Preserve four suit-specific variants for every court rank. | Local SVG uses `contain`; V12 container LOD preserves the Compact silhouette and hides the center only in Micro. Legacy generic SVG remains a temporary CSS fallback. | Every upstream and final SHA is pinned in `asset-provenance/playing-cards.json`; rollback removes the V13 attribute-specific selectors and returns to the four generic local assets. |
| P0 Joker center artwork | `.joker-face` selected by semantic `data-rank="small-joker"` / `big-joker` | Two derivatives from Dmitry Fomin's CC0 `Atlas deck joker red.svg` | **ADOPT / REPLACE shared generic Joker** | Crop the same central mirrored figure for both. Retain the red palette for big Joker and recolour selected fills to graphite/sand/grey for small Joker; retain distinct DOM labels and ARIA. | Local SVG uses `contain`; Compact preserves the figure and Micro preserves the text/index. | Upstream SHA `e6f044a3…`; finals `65f2baa2…` / `3761b22b…`; exact transformations and license evidence are pinned in the provenance manifest and `THIRD_PARTY_NOTICES.md`. |
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

Only material, geometry and the 14 explicitly approved central-artwork derivatives remain in the image layer; all gameplay state and labels stay live.

## P0 acceptance result after V13

- Historical V11 Contact Sheet: unchanged; the V13 vector import is covered by the provenance manifest and V13 runtime/browser evidence rather than being retrofitted into that raster sheet.
- Inventory: complete.
- Replacement Map: complete.
- P0 card-face material: **1 adopted project asset**, `kai-card-stock-6912c163.jpg`.
- Licensed card artwork: **14 adopted CC0 derivatives**, comprising 12 suit-specific J/Q/K centers and two distinct Jokers; exact hashes and modifications are recorded in `asset-provenance/playing-cards.json`.
- Dynamic face system: **kept**, including DOM ranks/suits/pips, semantic labels, interaction state and responsive LOD.
- KAI card back: **kept**, because the existing branded vector already meets the role.
- Required visual evidence: 1440×1000 lobby, 1280×720 live table, 390×844 phone, 844×390 landscape and 320×568 Micro checks.
- API/game rules/navigation: outside the media replacement boundary and must remain unchanged.

## Remaining optional inputs

No additional face atlas or card-back bitmap is needed after V13. Future media should be supplied only when it clearly improves an existing role without flattening state and when its license/provenance is recorded before runtime adoption. Optional candidates are:

- transparent or layerable hero-table render;
- separate felt/rail/table cutouts if they are intended to replace the current material-mask system.

Any later replacement must preserve DOM state, use approved local media in `web/assets`, record source/license/upstream and derived hashes, pass the V11 Full/Compact/Micro contract, and complete 1440/390/320 crop and perspective checks before adoption.
