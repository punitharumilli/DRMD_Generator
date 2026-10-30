# DRMD AI Generator: source of the single-file build

This folder builds `DRMD-Generator.html`, the one-file generator that is published on GitHub Pages.

## Build

Requirements: Node.js 20 or later.

```
npm install
npm run typecheck
npm run build
```

The result is `dist/DRMD-Generator.html`. Copy it into the repository and push it.

## Where things are

| File | What it holds |
|---|---|
| `src/services/providers.ts` | The AI providers: recommended models ("Automatic"), regions (Qwen), key and price links, data and speed notes, request formats, "Check key" |
| `src/services/pdfPages.ts` | Draws the PDF pages as images and reads the PDF text, for Qwen, whose models read images but not PDF files |
| `src/services/pricing.ts` | Price list used for the cost shown in AI settings, with the date it was checked (`PRICES_CHECKED`) |
| `src/services/llmService.ts` | Extraction prompts and schemas (the same for every provider), retries and model fallback |
| `src/utils/pdfjs.ts` | Opens PDFs with the embedded pdf.js: one shared worker, the embedded image decoders, no scripts from PDFs |
| `src/utils/dsi.ts` | D-SI unit rules from the D-SI guide v1.3 (DOI 10.5281/zenodo.3816686, each rule with its printed page in `GUIDE_PAGE`) and the D-SI 2.2.1 unit list (DOI 10.5281/zenodo.12200678): identifiers and quality classes, rules R001–R020, how a unit text is read (element symbols, hardness scales, notes such as "dry mass" or "as N"), conversion of units as written (never changing the value), and the check of AI answers |
| `src/utils/xmlValues.ts` | Numbers as printed → `si:value` (digit groups, decimal comma, ambiguous "1,234") and the other value formats of the schema |
| `src/services/rateLimit.ts` | Requests per minute per key and model: limits learned from the providers, requests held back until they fit |
| `src/types.ts` | The DRMD data model; `BinaryDocument` with the mark of the human-readable PDF (`rmDocument`) and its name in the XML (`rmDocumentName`) |
| `src/utils/sourceForms.ts` | Other forms of a value to look for in the PDF (a date written out, a country by name or address) |
| `vendor/pdfjs6/` | pdf.js 6.4.299 (official legacy build) and its WebAssembly decoders; `SOURCE.md` has the checksums and where they come from |
| `build.mjs` | Builds the single file and its security policy; `connect-src` lists every server the page may contact. It refuses to build if a pdf.js file differs from the official one |

## Tests of the D-SI units

```
npm install
npm run test:dsi
```

- `test/dsi-scenarios.cjs`: more than 1,100 units as printed in certificates, each with the D-SI unit it must give (or none), written from the SI brochure and the D-SI guide, with the page of the deciding rule.
- `test/dsi-matrix.cjs`: runs every scenario through the generator's own code (rule engine and XML), plus number reading, the check of AI answers and speed. Writes `test/out-matrix/matrix.json`.
- `test/dsi-xcheck.py` with `test/dsi_reference.py`: a second, independent implementation of the D-SI rules judges more than 120,000 generated D-SI strings; the generator must agree on every one. Needs Python 3.
- `test/dsi-unit.cjs`, `test/rpm-unit.cjs`: shorter checks of the rule engine and of the requests-per-minute tracker.

Run them after every change to `dsi.ts`, `xmlValues.ts` or `xmlGenerator.ts`. When a rule of the D-SI changes, change the scenario's expected unit first (with its source), then the code.

## Every three months

1. Check each provider's pricing page and update `src/services/pricing.ts` and `PRICES_CHECKED`.
2. Check that the models in `autoChain` (providers.ts) are still offered, and replace retired ones.
3. Check https://github.com/mozilla/pdf.js/security/advisories and the pdf.js releases. To update pdf.js, replace the files in `vendor/pdfjs6/` with those of the `pdfjs-dist` npm package (legacy build and wasm folder), update their SHA-256 values in `build.mjs` and `SOURCE.md`, and update the pdf.js entries in `THIRD-PARTY-NOTICES.txt`.
4. Rebuild, test with a key of each provider you use, and push.

A new provider or region needs its server address in `connect-src` in `build.mjs`, or the page will refuse to contact it. Before adding one, check that it answers requests made from a web page (CORS): Alibaba Cloud's Frankfurt, Tokyo and Hong Kong addresses did not in October 2026.

## Licence

Copyright (c) 2026 Bundesanstalt für Materialforschung und -prüfung (BAM). Licensed under the EUPL v1.2, see `LICENSE`. Each source file starts with its copyright and licence in two `SPDX-` lines.

The built file carries its licence notices, as the EUPL requires: at the top the copyright notice, "Licensed under the EUPL v1.2" and the address of this source code (Articles 3 and 5), and at the end the full text of the EUPL (`LICENSE`) and of every third-party licence (`THIRD-PARTY-NOTICES.txt`). `build.mjs` reads both files and stops if one is missing or contains text that cannot go into an HTML comment.

`THIRD-PARTY-NOTICES.txt` lists every third-party part of the built file, with its version, copyright notice and licence text. When a library is added, updated or removed (`package.json`, `vendor/`), change its entry in the same commit.

## When the repository moves

The address of the source code that the file shows comes from `repository` in `package.json` (the source code is expected in the folder named by `directory`, on the branch `main`). When the repository moves, for example to the BAMresearch organisation on GitHub, change `url` there, and `homepage` if the page moves too, then rebuild and publish the new `DRMD-Generator.html`.
