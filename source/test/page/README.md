# Tests on the published page

These files run the D-SI tests on the functions of the generator page itself, as it is published,
instead of on the TypeScript source. The checks are those of `../dsi-matrix-core.cjs` (the same as
`npm run test:dsi`), and the cross-check judges the 120,388 D-SI expressions of `../dsi_expressions.py`.

| File | What it does |
|---|---|
| `harness.js` | Finds the application script of the page, runs a copy of it from a `blob:` address with two additions only (it draws into an element that is not shown, and hands the functions to the test), checks that each function is the expected one, and runs the tests. The functions of the page are not changed. |
| `engine-names.json` | The short names that the build gave the tested functions, per version. |
| `expressions.js` | Makes the expressions of `../dsi_expressions.py` in JavaScript (Python's random number generator, Mersenne Twister), so that a browser makes the same 120,388 expressions. |
| `run-in-browser.js` | Paste it into the console of a blank tab: downloads the published page and these files, checks the SHA-256 of the page and prints the results. |
| `run-local.cjs` | The same with Playwright and Chromium on a copy of the page: `node test/page/run-local.cjs DRMD-Generator.html 1.0.0 results.json` |
| `compare-reference.py` | Compares the verdicts of a results file with the second implementation of the D-SI rules (`../dsi_reference.py`): `python3 -I test/page/compare-reference.py results.json` |

Two runs give the same results exactly when the three SHA-256 values that the harness prints
(checks, scenarios, verdicts) are the same; timings are left out of them.

After a new build, the short names in `engine-names.json` change: look them up in the built page and add
an entry for the new version. The harness refuses to run if a name is not the expected function.
