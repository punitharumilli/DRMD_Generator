// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Runs the D-SI tests on the functions of the generator page itself, as it is published, in the browser
// that shows it. Use it after test/dsi-matrix-core.cjs (which defines runMatrix) in the same page.
//
// The page's functions are not changed and nothing else of the page is touched. The page's application
// script is read from the page (document.scripts). A copy of it gets two additions only: it draws its
// interface into an element that is not shown (instead of the page), and at its end one statement hands
// the functions named in `names` to the test (the build gives them short names, listed per version in
// engine-names.json). The copy runs from a blob: address, which the page's security policy allows. No
// request leaves the browser.
(() => {
  const sha256 = async (text) => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(d)));
  };
  const hex = async (text) => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
  };
  window.__drmdPage = {
    // The SHA-256 of every inline script of the page (the page's security policy lists the same values)
    scriptHashes: async () => Promise.all(Array.from(document.scripts).filter(s => !s.src).map(s => sha256(s.textContent))),
    load: async (names) => {
      const app = Array.from(document.scripts).find(s => !s.src && s.textContent.includes('Could not find root element to mount to'));
      if (!app) throw new Error('The application script of the generator was not found in this page.');
      let code = app.textContent;
      const root = 'document.getElementById("root")';
      if (code.split(root).length !== 2) throw new Error('The place where the interface is drawn was not found exactly once.');
      code = code.replace(root, 'document.createElement("div")');
      const end = code.lastIndexOf('})();');
      if (end < 0) throw new Error('The end of the application script was not found.');
      const expose = `;window.__drmdEngine={${Object.entries(names).map(([k, v]) => `${JSON.stringify(k)}:typeof ${v}==="undefined"?void 0:${v}`).join(',')}};`;
      code = code.slice(0, end) + expose + code.slice(end);
      delete window.__drmdEngine;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      await new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = url; el.onload = resolve; el.onerror = () => reject(new Error('The copy of the application script did not run.'));
        document.head.appendChild(el);
      });
      const E = window.__drmdEngine;
      if (!E) throw new Error('The functions were not handed to the test.');
      const missing = Object.keys(names).filter(k => typeof E[k] !== 'function');
      if (missing.length) throw new Error(`Not functions in this page: ${missing.join(', ')} (engine-names.json does not fit this version).`);
      // Each name must be the function it is said to be
      const probes = {
        toDsi: () => E.toDsi('mg/kg').dsi === '\\milli\\gram\\kilogram\\tothe{-1}',
        checkDsi: () => E.checkDsi('\\metre').ok === true && E.checkDsi('\\kilo\\gram').ok === false,
        analyzeUnit: () => E.analyzeUnit('mg/kg dry mass').core === 'mg/kg',
        acceptAiUnit: () => E.acceptAiUnit('mg/kg', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}' }, []).ok === true,
        readNumber: () => E.readNumber('0,85').value === '0.85',
        buildDrmdXml: () => typeof E.buildDrmdXml({ administrativeData: { producers: [], responsiblePersons: [], documentIdentifiers: [] }, materials: [], properties: [], statements: { official: {}, custom: [] }, comments: [], documents: [], binaryDocuments: [] }).xml === 'string',
      };
      const wrong = Object.entries(probes).filter(([k, f]) => { try { return !f(); } catch { return true; } }).map(([k]) => k);
      if (wrong.length) throw new Error(`These names are not the expected functions: ${wrong.join(', ')}.`);
      return Object.keys(names);
    },
    // The unit scenarios and the checks of the XML (runMatrix), and the verdict of checkDsi on each D-SI
    // expression of the cross-check. Returns the results and the SHA-256 of their canonical form.
    run: async (scenarios, expressions) => {
      const E = window.__drmdEngine;
      const t0 = performance.now();
      const { results, report } = runMatrix({ D: E, G: { buildDrmdXml: E.buildDrmdXml }, V: { readNumber: E.readNumber }, SCENARIOS: scenarios, now: () => performance.now() });
      const t1 = performance.now();
      const verdicts = expressions.map(s => { const c = E.checkDsi(s); return [c.ok, c.ok ? c.cls : null, c.ok ? c.factor : null, c.ok ? c.dim : null, c.ok ? null : (c.errors || []).map(e => e.rule).join(',')]; });
      const t2 = performance.now();
      // Timings differ from run to run, so they are left out of the canonical form
      const checks = results.filter(r => !/^speed: /.test(r[1]));
      const scen = report.scenarios.map(r => [r.unit, r.ctx ? r.ctx.join(' | ') : null, r.got, r.gotCls, r.ok, r.xmlValue ?? null, r.xmlUnit ?? null]);
      return {
        checks: { total: results.length, passed: results.filter(r => r[0]).length, failed: results.filter(r => !r[0]) },
        scenarios: report.scenarios, numbers: report.numbers, ai: report.ai, speed: report.speed, xmlNotes: report.xmlNotes,
        verdicts,
        sha256: { checks: await hex(JSON.stringify(checks)), scenarios: await hex(JSON.stringify(scen)), verdicts: await hex(JSON.stringify(verdicts)) },
        ms: { matrix: Math.round(t1 - t0), crossCheck: Math.round(t2 - t1) },
        userAgent: navigator.userAgent, at: new Date().toISOString(), href: location.href,
      };
    },
  };
})();
