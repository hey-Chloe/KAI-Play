# Third-Party Notices

This file records third-party material distributed with KAI Play. It does not grant a license for KAI Play source code or first-party assets. The canonical machine-readable record, including exact source and derived-file hashes, is [`docs/asset-provenance/playing-cards.json`](docs/asset-provenance/playing-cards.json).

## Adrian Kennard (RevK) — SVG playing cards

- **Material used:** the central J/Q/K court artwork from the Standard deck, for all four suits.
- **Author:** Adrian Kennard (RevK); source page marks the work © 2018 Adrian Kennard before its CC0 release.
- **Source:** [Copyright free SVG and print ready playing cards](https://www.me.uk/cards/) and its [Standard deck exporter](https://www.me.uk/cards/makeadeck.cgi?view=).
- **Source statement:** the author releases the designs under the CC0 Public Domain licence, states that attribution is not required, and identifies the court cards as based on 19th-century Goodall & Son designs.
- **License:** [CC0 1.0 Universal](LICENSES/CC0-1.0.txt) ([canonical legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)).
- **Downloaded:** 2026-08-28.
- **Changes:** each full-card SVG was cropped to its central court illustration; the card frame, background, rank/suit indices and outer pip layout were removed; unused metadata/elements were removed and the remaining SVG was minified. Original court geometry and colours were retained.
- **Files:** `web/assets/cards/kai-court-{j,q,k}-{spade,heart,club,diamond}-*.svg` (12 files).
- **Excluded:** Aces, backs, Alteran characters, Duplimate variants and all other generated deck files are not distributed as part of this import.

Although CC0 does not require attribution, KAI Play gratefully credits Adrian Kennard for making these designs available.

## Dmitry Fomin — Atlas deck red Joker

- **Material used:** the central mirrored Joker figure, used as the basis of both KAI Play Jokers.
- **Author:** Дмитрий Фомин (Dmitry Fomin).
- **Source:** [Atlas deck joker red.svg](https://commons.wikimedia.org/wiki/File:Atlas_deck_joker_red.svg), Wikimedia Commons; [original SVG download](https://commons.wikimedia.org/wiki/Special:Redirect/file/Atlas_deck_joker_red.svg).
- **Source SHA-256:** `e6f044a37683e332344eaad07a4f3c00d4a14b735acb1a8c740da9e993ceae75`.
- **License:** [CC0 1.0 Universal](LICENSES/CC0-1.0.txt) ([canonical legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)).
- **Downloaded:** 2026-08-28.
- **Changes:** the full 360×540 SVG was cropped horizontally to the central figure (`viewBox="58 0 244 540"`), peripheral card markings and unused metadata/elements were removed, and the SVG was minified. The big Joker retains the red source palette. The small Joker uses the same geometry with selected warm red/orange/yellow/pink fills remapped to KAI graphite, sand and grey tones so that the two Jokers remain visibly distinct.
- **Files:** `web/assets/cards/kai-joker-big-65f2baa2.svg` and `web/assets/cards/kai-joker-small-3761b22b.svg`.

Although CC0 does not require attribution, KAI Play gratefully credits Dmitry Fomin for making the Atlas Joker available.

## No endorsement

The authors and source sites named above do not sponsor or endorse KAI Play. CC0 does not waive or license trademark or patent rights, and the materials are provided without warranty. KAI Play distributes only the specifically listed, locally stored derivatives; it does not hotlink runtime artwork.
