// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Runs every scenario of dsi-scenarios.cjs through the generator's own code:
//   1. the rule engine (toDsi): the D-SI unit and its class, or no conversion where none is allowed;
//   2. the XML generator: the value is written exactly as printed, with the expected D-SI unit;
// plus number reading, the AI-answer check and speed. Writes test/out-dsi/matrix.json for the report.
const fs = require('fs');
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const load = (f) => {
  const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', f)], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
  const mod = { exports: {} }; new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require); return mod.exports;
};
const D = load('src/utils/dsi.ts');
const G = load('src/utils/xmlGenerator.ts');
const V = load('src/utils/xmlValues.ts');
const { SCENARIOS } = require('./dsi-scenarios.cjs');

const { runMatrix } = require('./dsi-matrix-core.cjs');
const { results, report } = runMatrix({ D, G, V, SCENARIOS, now: () => Number(process.hrtime.bigint()) / 1e6, log: console.log, verbose: !!process.env.VERBOSE });
fs.mkdirSync(path.join(__dirname, 'out-matrix'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out-matrix', 'matrix.json'), JSON.stringify(report, null, 1));
const failed = results.filter(r => !r[0]).length;
console.log(failed === 0 ? `\n${results.length}/${results.length} checks passed` : `\n${failed} of ${results.length} checks FAILED`);
process.exit(failed ? 1 : 0);
