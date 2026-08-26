# KAI PLAY — Asset Inventory

Snapshot time: 2026-08-26 (Asia/Shanghai)  
Pass: `EXISTING ASSET INGESTION` / evidence before implementation  
Page implementation status: **unchanged in this pass**

## Finding

The accessible disk does not contain the newly described batch of finished KAI PLAY card faces, card backs, hero tables, mahjong, three-card poker, or reel assets.

The only production-eligible KAI PLAY media found are the two material textures and the current vector geometry already present in `game/web/assets`. The newest generated-image batch is predominantly XIAOYUE archive/stationery imagery, not KAI PLAY. The ten supplied clipboard images are design references, not transparent production cutouts.

For that reason this inventory does **not** promote unrelated imagery into the runtime and does not claim that P0 has been replaced.

## Scan coverage

- Current repository: `game/web/assets`, `game/docs`, `game`, workspace roots.
- Current project `outputs` directories: none found; no new assets recovered there.
- `/Users/kai/.codex/generated_images`: 61 PNG files total; 50 dated 2026-08-26. The newest 29 were visually inspected. All 61 report no alpha channel.
- User attachment/temp directory: all 10 images named in the two KAI PLAY visual-review messages were inspected.
- `/Users/kai/Downloads`: recent image files were filtered by name, metadata, and visual relevance; no additional KAI PLAY production batch was found.
- Adjacent Codex workspaces: one XIAOYUE felt texture was retained below as an explicit rejected comparison; no transferable KAI PLAY batch was found.

The [full contact sheet](./KAI_PLAY_FULL_ASSET_CONTACT_SHEET.png) shows all 24 relevant, adjacent, or reference candidates, including duplicates supplied as separate files. It records thumbnail, filename, dimensions, alpha state, source directory, modification time, and SHA prefix.

## Status vocabulary

- **USED** — referenced by the current V4 runtime.
- **SOURCE** — high-resolution source from which a runtime asset was derived.
- **REFERENCE** — composition/material reference only; not licensed or technically suitable as a runtime asset.
- **REJECTED** — must not enter KAI PLAY.
- **BLOCKED** — requested role has no eligible new image on disk.

## A. Current KAI PLAY production assets

Source directory: `game/web/assets`

| File | Technical facts | Visual description | Recommended use | Quality | Replace current CSS/SVG? | Desktop | Mobile | Status |
|---|---|---|---|---|---|---|---|---|
| `kai-felt-v4.avif` | 720×720 AVIF; 77,522 B; no alpha; 2026-08-26 08:37:10; SHA `a5178d07db5ff96e…` | Seamless deep emerald felt with restrained fibre variation | Table-center material under responsive masks | High | **No** — it already replaces flat fill | Excellent as tiled material | Excellent as tiled material | USED |
| `kai-leather-v4.avif` | 720×720 AVIF; 93,563 B; no alpha; 2026-08-26 08:37:10; SHA `fe4ee9ba14860784…` | Graphite leather with subtle grain and lighting-neutral tonal range | Outer table shell and padded rail | High | **No** — it is already the current material | Excellent | Excellent | USED |
| `kai-card-back.svg` | 180×260 SVG; 2,367 B; transparent outside card; 2026-08-25 17:47:39; SHA `426fe8400fd13973…` | KAI-branded emerald/graphite card back with coral accent and geometric K pattern | Current lobby, deal, stack, and gameplay backs | Good vector asset; still not the newly requested bitmap | **No eligible replacement found** | Good | Good | USED / P0 BLOCKED |
| `card-paper.svg` | 64×64 SVG; 440 B; transparent noise; 2026-08-25 17:47:39; SHA `ebbcc2b4e63bbc3e…` | Subtle warm-white paper grain | Texture layer for DOM-rendered card faces | Good supporting texture | **No eligible face image found** | Good | Good | USED / P0 BLOCKED |
| `kai-table-outer-mask.svg` | 1200×680 SVG; 266 B; alpha; 2026-08-26 08:40:08; SHA `5338c045e4b8993d…` | Desktop outer-table silhouette | Geometry mask only; combine with leather | High for role | KEEP | Excellent | N/A | USED |
| `kai-table-rail-mask.svg` | 1200×680 SVG; 458 B; alpha; same mtime; SHA `a24f971b28708ce0…` | Desktop padded-rail ring | Geometry mask only; combine with leather | High for role | KEEP | Excellent | N/A | USED |
| `kai-table-felt-mask.svg` | 1200×680 SVG; 270 B; alpha; same mtime; SHA `1eff5bfcf690fb23…` | Desktop felt aperture | Geometry mask only; combine with felt | High for role | KEEP | Excellent | N/A | USED |
| `kai-table-mobile-outer-mask.svg` | 680×760 SVG; 232 B; alpha; 2026-08-26 08:49:42; SHA `73ecf6eefcb38f60…` | Tall mobile outer-table silhouette | Mobile geometry mask | High for role | KEEP | N/A | Excellent | USED |
| `kai-table-mobile-rail-mask.svg` | 680×760 SVG; 381 B; alpha; same mtime; SHA `e4261c8229403570…` | Tall mobile padded-rail ring | Mobile geometry mask | High for role | KEEP | N/A | Excellent | USED |
| `kai-table-mobile-felt-mask.svg` | 680×760 SVG; 226 B; alpha; same mtime; SHA `e022b7ad0dd59cc7…` | Tall mobile felt aperture | Mobile geometry mask | High for role | KEEP | N/A | Excellent | USED |

Runtime evidence: `game/web/styles.css` references the paper texture at line 1503, KAI card back at 1694 and 1950, desktop masks/materials at 2310–2355, and mobile masks at 2516–2526. Player names, room state, cards, and game state remain DOM generated by `game/web/app.js`.

## B. High-resolution source masters and adjacent generated evidence

| File / source | Technical facts | Visual description | Recommended use | Quality | Replace current asset? | Desktop | Mobile | Status |
|---|---|---|---|---|---|---|---|---|
| `exec-1d2ed926-cb43-4908-86e8-bb0ffed82afe.png` / `.codex/generated_images/01a022f3…` | 1254×1254 PNG; 2,808,354 B; no alpha; 2026-08-26 08:36:17; SHA `83f117df07bffa64…` | Full-resolution emerald felt source | Archive as master for `kai-felt-v4.avif` | High | **No** — optimized AVIF is 97.2% smaller | Source-only | Source-only | SOURCE |
| `exec-2c42d2d4-f444-46bd-869a-4df8bc1f7dd6.png` / `.codex/generated_images/01a022f3…` | 1254×1254 PNG; 2,808,728 B; no alpha; 2026-08-26 08:36:43; SHA `a7e4277d837f51aa…` | Full-resolution graphite leather source | Archive as master for `kai-leather-v4.avif` | High | **No** — optimized AVIF is 96.7% smaller | Source-only | Source-only | SOURCE |
| `exec-525f3cd7-8dd0-459a-9204-e226b6feff1b.png` / `.codex/generated_images/01a03c2b…` | 1448×1086 PNG; 1,537,528 B; no alpha; 2026-08-26 11:50:23; SHA `0fda7ddecf30d108…` | Warm ivory / emerald / sage / coral / graphite swatch board | Colour and material direction reference only | Medium | REMOVE from runtime | Reference only | Reference only | REFERENCE |
| `felt-forest-2048.png` / XIAOYUE archive UI kit | 2048×2048 PNG; 5,943,577 B; no alpha; 2026-08-26 12:07:39; SHA `5c7b9afc5168a015…` | Dark forest felt texture from another product system | None in KAI PLAY; retain product boundary | Technically high, contextually wrong | **REMOVE / do not cross-use** | No | No | REJECTED |

The source-to-runtime relation is explicit: the two 1254² PNGs are masters; the 720² AVIFs are the load-bearing web files. The originals are not additional unused P0 visuals.

## C. User-supplied visual references

Source directory: `/private/var/folders/4l/gpc8dgs5269cmqp4v06my3tr0000gn/T`

These files have no alpha and contain complete third-party layouts, backgrounds, avatars, chips, or watermarks. Their reuse rights are **UNKNOWN**. They are evidence for perspective, material, spacing, and card hierarchy only.

| File | Facts | Visual description | Recommended use | Quality | Replace CSS/SVG? | Desktop | Mobile | Status |
|---|---|---|---|---|---|---|---|---|
| `codex-clipboard-72e13669-…png` | 1147×860; 421,687 B; 2026-08-26 08:32:40; SHA `b0b896fe75b98cae…` | Mobile four-player poker table composition | Study table depth, contact shadows, player anchoring | High reference | No | Reference | Strong reference | REFERENCE |
| `codex-clipboard-96f84f7d-…png` | 846×800; 294,581 B; 08:32:36; SHA `a9292f76cc5b5609…` | Photographic side-view premium table | Study padded rail thickness and physical elevation | High reference | No | Strong reference | Weak crop fit | REFERENCE |
| `codex-clipboard-9c9eab0d-…png` | 1720×860; 1,524,440 B; 08:32:31; SHA `083f24335eeac6b9…` | Photographic top-view oval table and seats | Study surface/rail/seat physical relationship | High reference | No | Strong reference | Weak crop fit | REFERENCE |
| `codex-clipboard-4a2ea065-…png` | 474×379; 276,546 B; 2026-08-25 17:40:04; SHA `e32a3b02140daece…` | Dark mobile gaming UI collage | General game-surface contrast reference | Medium; small | No | Weak | Medium | REFERENCE |
| `codex-clipboard-83b785b3-…png` | 474×379; byte-identical SHA `e32a3b…` | Duplicate of prior collage | None beyond duplicate provenance | Duplicate | No | No | No | REFERENCE / DUPLICATE |
| `codex-clipboard-b5bb1db4-…png` | 474×379; byte-identical SHA `e32a3b…` | Duplicate of prior collage | None beyond duplicate provenance | Duplicate | No | No | No | REFERENCE / DUPLICATE |
| `codex-clipboard-d5704cf4-…png` | 444×355; 192,734 B; 17:39:19; SHA `e3b8e4f1af832887…` | Mobile lobby / poker table / join flow mockups | Study surface separation and lobby hierarchy | Medium; small | No | Weak | Good reference | REFERENCE |
| `codex-clipboard-1ef80f74-…png` | 444×355; 135,069 B; 17:39:10; SHA `5d2199a5e23c8a7…` | Table picker plus live table mockups | Study join-to-play surface transition | Medium; small | No | Weak | Good reference | REFERENCE |
| `codex-clipboard-4167de12-…png` | 2048×1536; 873,429 B; 17:39:06; SHA `c32758cfdf304af3…` | Phone poker UI with card/chip hierarchy | Study card scale and table presence | High reference | No | Reference | Strong reference | REFERENCE |
| `codex-clipboard-24e43cc5-…png` | 264×360; 137,267 B; 17:37:51; SHA `692b62d36298b1af…` | Low-resolution playing-card index with watermark | Suit/rank coverage reference only | Low; watermark; incomplete crop | **No** | No | No | REJECTED as production asset |

## Missing requested roles

| Requested role | Disk result | Gate |
|---|---|---|
| Premium playing-card faces | No finished KAI asset found | P0 BLOCKED |
| New KAI card back | No finished replacement found | P0 BLOCKED |
| Complete hero table render/cutout | No eligible KAI image found | P0 BLOCKED; current layered DOM/CSS surface remains |
| Mahjong | No production asset found | P1 not started |
| Three-card poker | No production asset found | P1 not started |
| Reel / other games | No production asset found | P1 not started |
| Player seats / table decoration cutouts | No transparent production asset found | P1 not started |

## Provenance and rights

- Current textures: generated in a prior KAI PLAY run and optimized locally; generation provenance is known, but explicit commercial-rights documentation is not stored beside the files.
- Current SVGs: repository-native KAI PLAY implementation assets.
- Clipboard references: user-supplied as visual references; original creator/license is UNKNOWN.
- XIAOYUE felt: belongs to a separate product/art-direction system and is intentionally excluded.

No external reference image is copied into `game/web/assets` by this pass.
