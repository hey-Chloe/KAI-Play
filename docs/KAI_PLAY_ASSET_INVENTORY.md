# KAI PLAY — Asset Inventory

Snapshot time: 2026-08-28 (Asia/Shanghai)<br>
Pass: `CARD MATERIAL V11 + FIDELITY V12` / historical inventory updated with current project media<br>
Page implementation status: **V11 card stock adopted; V12 size-aware fidelity active; semantic DOM/SVG faces preserved**

## Finding

The repository now contains one newly generated, production-eligible KAI PLAY face material: `kai-card-stock-6912c163.jpg`. It is a neutral card-stock surface rather than a baked card face, so live ranks, suits, pips, accessibility labels and interaction state remain DOM driven.

The adopted card stock combines with the repository-native KAI card back and mirrored J/Q/K/Joker SVG artwork. Existing felt, leather and responsive masks remain table materials. The historical XIAOYUE archive/stationery imagery and ten supplied clipboard images remain references or rejected inputs, not production cutouts.

No unrelated imagery is promoted into the runtime. V11 resolves the face-material role without flattening dynamic cards into a raster atlas; the exact rendering and acceptance contract is recorded in `KAI_PLAY_CARD_MATERIAL_V11.md`.

## Scan coverage

- Current repository: `web/assets`, `docs`, repository root and workspace roots.
- Current project `outputs` directories: none found; no new assets recovered there.
- `/Users/kai/.codex/generated_images`: 61 PNG files total; 50 dated 2026-08-26. The newest 29 were visually inspected. All 61 report no alpha channel.
- User attachment/temp directory: all 10 images named in the two KAI PLAY visual-review messages were inspected.
- `/Users/kai/Downloads`: recent image files were filtered by name, metadata, and visual relevance; no additional KAI PLAY production batch was found.
- Adjacent Codex workspaces: one XIAOYUE felt texture was retained below as an explicit rejected comparison; no transferable KAI PLAY batch was found.

The [full contact sheet](./KAI_PLAY_FULL_ASSET_CONTACT_SHEET.png) shows all 24 relevant, adjacent, or reference candidates, including duplicates supplied as separate files. It records thumbnail, filename, dimensions, alpha state, source directory, modification time, and SHA prefix.

## Status vocabulary

- **USED** — referenced by the current runtime.
- **ADOPTED** — approved as a KAI PLAY project material for the V11 runtime contract.
- **SOURCE** — high-resolution source from which a runtime asset was derived.
- **REFERENCE** — composition/material reference only; not licensed or technically suitable as a runtime asset.
- **REJECTED** — must not enter KAI PLAY.
- **BLOCKED** — requested role has no eligible new image on disk.

## A. Current KAI PLAY production assets

Source directory: `web/assets`

| File | Technical facts | Visual description | Recommended use | Quality | Replace current CSS/SVG? | Desktop | Mobile | Status |
|---|---|---|---|---|---|---|---|---|
| `kai-felt-v4.avif` | 720×720 AVIF; 77,522 B; no alpha; 2026-08-26 08:37:10; SHA `a5178d07db5ff96e…` | Seamless deep emerald felt with restrained fibre variation | Table-center material under responsive masks | High | **No** — it already replaces flat fill | Excellent as tiled material | Excellent as tiled material | USED |
| `kai-leather-v4.avif` | 720×720 AVIF; 93,563 B; no alpha; 2026-08-26 08:37:10; SHA `fe4ee9ba14860784…` | Graphite leather with subtle grain and lighting-neutral tonal range | Outer table shell and padded rail | High | **No** — it is already the current material | Excellent | Excellent | USED |
| `kai-card-stock-6912c163.jpg` | 512×512 JPEG; 60,976 B; no alpha; 2026-08-28 14:32:11; SHA `6912c16336df5876…` | Warm ivory card stock with a restrained, even micro-weave and diffuse lighting; no ranks, suits, logos or watermark | Primary V11 material beneath DOM-rendered card faces | High; neutral enough for red and graphite ink | **Yes — ADOPT as the V11 face-stock material**, with CSS colour/gradient fallback | Excellent in Full/Compact | Good in Compact; Micro hides raster detail | ADOPTED / USED V11+V12 |
| `kai-card-back.svg` | 180×260 SVG; 2,367 B; transparent outside card; 2026-08-25 17:47:39; SHA `426fe8400fd13973…` | KAI-branded emerald/graphite card back with coral accent and geometric K pattern | Current lobby, deal, stack, and gameplay backs | Good vector asset at all delivered sizes | **KEEP — V11 requires no replacement** | Good | Good | USED / KEEP |
| `card-paper.svg` | 64×64 SVG; 440 B; transparent noise; 2026-08-25 17:47:39; SHA `ebbcc2b4e63bbc3e…` | Subtle warm-white procedural paper grain | Lightweight fallback beneath DOM-rendered card faces and compatible tile surfaces | Good supporting fallback | **KEEP as fallback**, not the primary V11 material | Good | Good | USED / FALLBACK |
| `kai-court-j.svg`, `kai-court-q.svg`, `kai-court-k.svg`, `kai-joker-court.svg` | Four local 120×180 SVGs; 1,438–1,773 B each; internal mirrored `<use>` construction; no external media | Original KAI two-headed court and Joker illustrations | J/Q/K/Joker center artwork while rank/suit indices stay semantic DOM | Good and resolution-independent | **KEEP / COMBINE** with V11 card stock | Excellent | Good when Compact/Micro rules are applied | USED / KEEP |
| `kai-table-outer-mask.svg` | 1200×680 SVG; 266 B; alpha; 2026-08-26 08:40:08; SHA `5338c045e4b8993d…` | Desktop outer-table silhouette | Geometry mask only; combine with leather | High for role | KEEP | Excellent | N/A | USED |
| `kai-table-rail-mask.svg` | 1200×680 SVG; 458 B; alpha; same mtime; SHA `a24f971b28708ce0…` | Desktop padded-rail ring | Geometry mask only; combine with leather | High for role | KEEP | Excellent | N/A | USED |
| `kai-table-felt-mask.svg` | 1200×680 SVG; 270 B; alpha; same mtime; SHA `1eff5bfcf690fb23…` | Desktop felt aperture | Geometry mask only; combine with felt | High for role | KEEP | Excellent | N/A | USED |
| `kai-table-mobile-outer-mask.svg` | 680×760 SVG; 232 B; alpha; 2026-08-26 08:49:42; SHA `73ecf6eefcb38f60…` | Tall mobile outer-table silhouette | Mobile geometry mask | High for role | KEEP | N/A | Excellent | USED |
| `kai-table-mobile-rail-mask.svg` | 680×760 SVG; 381 B; alpha; same mtime; SHA `e4261c8229403570…` | Tall mobile padded-rail ring | Mobile geometry mask | High for role | KEEP | N/A | Excellent | USED |
| `kai-table-mobile-felt-mask.svg` | 680×760 SVG; 226 B; alpha; same mtime; SHA `e022b7ad0dd59cc7…` | Tall mobile felt aperture | Mobile geometry mask | High for role | KEEP | N/A | Excellent | USED |

Runtime boundary: `web/styles.css` owns local card/table material layers and responsive geometry; `web/app.js` continues to generate ranks, suits, pips, player names, room state and game state. The V11 card-stock image must never become a full face atlas. See `KAI_PLAY_CARD_MATERIAL_V11.md` for Full/Compact/Micro and browser acceptance.

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

## Requested-role resolution after V11

| Requested role | Disk result | Gate |
|---|---|---|
| Premium playing-card faces | V11 card stock plus DOM pips/indices and local J/Q/K/Joker SVGs | P0 RESOLVED by layered material system |
| KAI card back | Existing local branded vector remains eligible and consistent | RESOLVED / KEEP; no replacement required |
| Complete hero table render/cutout | Layered felt/leather/mask system remains responsive and keeps state live | RESOLVED by design; no flattened table image required |
| Mahjong | No production asset found | P1 not started |
| Three-card poker | No production asset found | P1 not started |
| Reel / other games | No production asset found | P1 not started |
| Player seats / table decoration cutouts | No transparent production asset found | P1 not started |

## Provenance and rights

- V11 card stock: generated for KAI PLAY in the current project pass, stored locally as `kai-card-stock-6912c163.jpg`; no third-party card face or brand is embedded in the image.
- Existing table textures: generated in a prior KAI PLAY run and optimized locally; generation provenance is known, but explicit commercial-rights documentation is not stored beside the files.
- Current SVGs: repository-native KAI PLAY implementation assets.
- Clipboard references: user-supplied as visual references; original creator/license is UNKNOWN.
- XIAOYUE felt: belongs to a separate product/art-direction system and is intentionally excluded.

No external reference image is copied into `web/assets` by this pass; the newly adopted card stock is project-generated media.
