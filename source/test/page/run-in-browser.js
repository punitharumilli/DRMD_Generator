// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Runs the D-SI tests on the published generator page in your own browser. Open a blank tab
// (about:blank), open the developer tools (F12), and paste this file into the Console. It downloads the
// page from its published address and the test files of this repository at REF, compares the SHA-256 of
// the page with PAGE_SHA256 (leave it empty to only show it), runs the tests on the page's own functions
// (harness.js) and prints the results with their SHA-256. Nothing is sent anywhere.
(async () => {
  const PAGE = 'https://bamresearch.github.io/drmd-generator/';
  const REF = 'main';            // a commit of this repository, for example the one of a release
  const PAGE_SHA256 = '';        // the SHA-256 of the release page, if it is to be checked
  const BASE = `https://raw.githubusercontent.com/BAMresearch/drmd-generator/${REF}/source/test/`;
  const get = async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); };
  const hex = async (t) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map(b => b.toString(16).padStart(2, '0')).join('');
  const html = await get(PAGE);
  const pageSha = await hex(html);
  if (PAGE_SHA256 && pageSha !== PAGE_SHA256) throw new Error(`The page has the SHA-256 ${pageSha}, not ${PAGE_SHA256}.`);
  // The application script of the page, placed in this tab as text, where harness.js finds it
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const app = [...doc.querySelectorAll('script')].find(s => !s.src && s.textContent.includes('Could not find root element to mount to'));
  const holder = document.createElement('script'); holder.type = 'text/plain'; holder.textContent = app.textContent; document.head.appendChild(holder);
  // The test code: the checks (dsi-matrix-core.cjs), the harness, the expressions, the scenarios
  const [core, harness, expr, scen, py, namesJson] = await Promise.all(['dsi-matrix-core.cjs', 'page/harness.js', 'page/expressions.js', 'dsi-scenarios.cjs', 'dsi_reference.py', 'page/engine-names.json'].map(f => get(BASE + f)));
  new Function(`${core}\n${harness}`)();
  const em = { exports: {} }; new Function('module', 'exports', expr)(em, em.exports);
  const sm = { exports: {} }; new Function('module', 'exports', 'require', scen)(sm, sm.exports, { main: null });
  const expressions = em.exports.drmdExpressions(em.exports.drmdReferenceLists(py));
  const version = (html.match(/DRMD AI Generator (\d+\.\d+\.\d+)/) || [])[1];
  const names = JSON.parse(namesJson)[version];
  if (!names) throw new Error(`engine-names.json has no entry for version ${version}.`);
  await window.__drmdPage.load(names);
  const res = await window.__drmdPage.run(sm.exports.SCENARIOS, expressions);
  window.drmdTestResults = res;
  const summary = {
    page: PAGE, version, pageSha256: pageSha, ref: REF,
    checks: `${res.checks.passed} of ${res.checks.total} passed`, failed: res.checks.failed.map(f => `${f[1]} | ${f[2]}`),
    scenarios: `${res.scenarios.filter(s => s.ok).length} of ${res.scenarios.length} passed`,
    expressions: res.verdicts.length, expressionsSha256: await hex(JSON.stringify(expressions)), valid: res.verdicts.filter(v => v[0]).length,
    sha256: res.sha256, ms: res.ms, at: res.at,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log('All results are in window.drmdTestResults; compare the verdicts with the Python reference with compare-reference.py.');
  return summary;
})();
