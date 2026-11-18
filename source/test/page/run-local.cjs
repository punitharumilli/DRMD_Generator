// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Runs harness.js on a copy of the generator page in Chromium (Playwright), the same way as on the
// published page: node test/page/run-local.cjs <DRMD-Generator.html> <version> <results.json>
// The page is opened from the file; every request it makes is refused and listed.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [pageFile, version, outFile] = process.argv.slice(2);
if (!pageFile || !version || !outFile) { console.error('Usage: node run-local.cjs <DRMD-Generator.html> <version> <results.json>'); process.exit(2); }
const names = JSON.parse(fs.readFileSync(path.join(__dirname, 'engine-names.json'), 'utf8'))[version];
if (!names) { console.error(`No engine names for version ${version} in engine-names.json`); process.exit(2); }
const code = `(() => {\n${fs.readFileSync(path.join(__dirname, '..', 'dsi-matrix-core.cjs'), 'utf8')}\n${fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8')}\n})();`;
const { SCENARIOS } = require('../dsi-scenarios.cjs');
const expressions = JSON.parse(execFileSync('python3', ['-I', '-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..'))}); from dsi_expressions import expressions; print(json.dumps(expressions()))`], { maxBuffer: 64 << 20 }).toString());
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const requests = [];
  await page.route('**/*', (route) => { const u = route.request().url(); if (/^(file|blob|data):/.test(u)) return route.continue(); requests.push(u); return route.abort(); });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + path.resolve(pageFile));
  await page.waitForTimeout(1500);
  await page.evaluate(code);
  const loaded = await page.evaluate((n) => window.__drmdPage.load(n), names);
  const hashes = await page.evaluate(() => window.__drmdPage.scriptHashes());
  const res = await page.evaluate(([s, e]) => window.__drmdPage.run(s, e), [SCENARIOS, expressions]);
  res.expressions = expressions; res.scriptHashes = hashes; res.functions = loaded; res.blockedRequests = requests; res.pageErrors = errors;
  fs.writeFileSync(outFile, JSON.stringify(res));
  console.log(`checks ${res.checks.passed}/${res.checks.total}; scenarios ${res.scenarios.filter(r => r.ok).length}/${res.scenarios.length}; expressions ${res.verdicts.length}; sha256 ${JSON.stringify(res.sha256)}; requests refused ${requests.length}; page errors ${errors.length}`);
  for (const f of res.checks.failed.slice(0, 20)) console.log('FAIL', f[1], f[2] || '');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
