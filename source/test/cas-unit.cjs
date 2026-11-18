// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// CAS Registry Numbers, InChIKeys and PubChem CIDs of substances (src/services/llmService.ts,
// decideChemicalIdentifiersDetailed): a CAS number is written only if it is one of the candidates that
// PubChem and the element table give (each with a valid check digit). With exactly one candidate no
// model is asked; with several the model chooses one of them; with none no CAS number is written and
// no model is asked. The InChIKey and the CID are always those of PubChem. The SDKs are replaced by
// stand-ins, so no request leaves the machine.
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const stub = {
  name: 'stub-sdks',
  setup(build) {
    build.onResolve({ filter: /^(@google\/genai|p-retry)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents: a.path === 'p-retry'
        ? 'module.exports = async (fn) => fn(1); module.exports.AbortError = class extends Error {};'
        : 'exports.Type = { OBJECT: "OBJECT", STRING: "STRING", ARRAY: "ARRAY", NUMBER: "NUMBER", BOOLEAN: "BOOLEAN", INTEGER: "INTEGER" }; exports.GoogleGenAI = class { constructor() { throw new Error("no requests in this test"); } };',
      loader: 'js',
    }));
  },
};
(async () => {
  const out = await esbuild.build({ entryPoints: [path.join(__dirname, '../src/services/llmService.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error', plugins: [stub] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  const { decideChemicalIdentifiersDetailed } = mod.exports;
  const results = []; const check = (name, ok, extra = '') => { results.push([ok, name]); if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
  const api = (cas) => ({ casCandidates: cas, inchiKey: 'XEEYBQQBJWHFJM-UHFFFAOYSA-N', pubchemCid: '23925', synonymsSample: ['iron', '1309-37-1'] });
  const noConn = { provider: 'none', apiKey: '', model: '' };
  let r = await decideChemicalIdentifiersDetailed('Iron', 'Fe in steel', api([]), noConn);
  check('no candidate: no CAS number, no model asked, InChIKey and CID from PubChem', !r.identifiers.cas && r.decidedBy === 'determined' && r.identifiers.inchiKey === 'XEEYBQQBJWHFJM-UHFFFAOYSA-N' && r.identifiers.pubchemCid === '23925', JSON.stringify(r));
  r = await decideChemicalIdentifiersDetailed('Iron', 'Fe in steel', api(['7439-89-6']), noConn);
  check('one candidate: that CAS number, no model asked', r.identifiers.cas === '7439-89-6' && r.decidedBy === 'determined', JSON.stringify(r));
  r = await decideChemicalIdentifiersDetailed('Iron', 'Fe in steel', api(['7439-89-6', '1309-37-1']), noConn, { skipLlm: true });
  check('several candidates without the model: the first (PubChem\'s preferred one)', r.identifiers.cas === '7439-89-6' && r.decidedBy === 'fallback', JSON.stringify(r));
  const quiet = console.error; console.error = () => {}; // the failed request is logged by the code itself
  r = await decideChemicalIdentifiersDetailed('Iron', 'Fe in steel', api(['7439-89-6', '1309-37-1']), noConn);
  console.error = quiet;
  check('several candidates, the model cannot be reached: the first candidate', r.identifiers.cas === '7439-89-6', JSON.stringify(r));
  r = await decideChemicalIdentifiersDetailed('Iron', 'Fe in steel', {}, noConn);
  check('nothing found: no identifiers', !r.identifiers.cas && !r.identifiers.inchiKey && !r.identifiers.pubchemCid, JSON.stringify(r));
  const failed = results.filter(x => !x[0]).length;
  console.log(failed === 0 ? `\n${results.length}/${results.length} checks passed` : `\n${failed} of ${results.length} checks FAILED`);
  process.exit(failed ? 1 : 0);
})();
