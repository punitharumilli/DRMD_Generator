// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2
//
// Builds the whole generator into ONE self-contained HTML file.
//
//   node build.mjs            -> dist/DRMD-Generator.html
//
// Everything the page needs is inlined: the app (React + Gemini SDK), compiled CSS, fonts,
// pdf.js (+ its worker, started from a Blob so it also works when the file is opened via file://,
// and its two image decoders as WebAssembly) and JSZip. The finished file loads nothing from the
// internet; at run time it only talks to the AI provider chosen in AI settings, PubChem, ROR and CAS
// Common Chemistry.
//
// The file carries its licence notices: the copyright notice, "Licensed under the EUPL" and the
// address of the source code at the top (EUPL v1.2, Articles 3 and 5), and at the end the full text
// of the EUPL (LICENSE) and of every third-party licence (THIRD-PARTY-NOTICES.txt).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const loadEsbuild = () => {
  for (const id of [process.env.ESBUILD_PATH, 'esbuild', '/opt/npm-tools/node_modules/esbuild'].filter(Boolean)) {
    try { return require(id); } catch { /* try the next location */ }
  }
  throw new Error('esbuild not found. Run "npm install" first.');
};
const esbuild = loadEsbuild();
const OUT = path.join(ROOT, 'dist');
fs.mkdirSync(OUT, { recursive: true });

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

// ---- 0. licence notices -----------------------------------------------------------------------
// The copyright holder and years, and where the source code is published (package.json
// "repository"; change the address there when the repository moves).
const COPYRIGHT_YEARS = '2026';
const COPYRIGHT = `Copyright (c) ${COPYRIGHT_YEARS} Bundesanstalt für Materialforschung und -prüfung (BAM)`;
const repo = pkg.repository || {};
if (pkg.license !== 'EUPL-1.2' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repo.url || '') || !repo.directory) {
  throw new Error('package.json needs "license": "EUPL-1.2" and "repository": { "url": "https://github.com/<owner>/<repo>", "directory": "..." }');
}
const SOURCE_URL = `${repo.url}/tree/main/${repo.directory}`;
const licenceText = read('LICENSE');
const thirdPartyText = read('THIRD-PARTY-NOTICES.txt');
if (!licenceText.startsWith('                      EUROPEAN UNION PUBLIC LICENCE v. 1.2')) throw new Error('LICENSE is not the EUPL v1.2');
// Both texts go into an HTML comment at the end of the page: nothing in them may end that comment or
// look like a script element (the security policy below counts the inline scripts).
for (const [name, text] of [['LICENSE', licenceText], ['THIRD-PARTY-NOTICES.txt', thirdPartyText]]) {
  if (/-->|--!>|<!--|<\/?script/i.test(text)) throw new Error(`${name} contains text that cannot go into an HTML comment`);
}

// ---- 1. application bundle ------------------------------------------------------------------
const app = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/index.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'edge100', 'firefox100', 'safari15'],
  minify: true,
  legalComments: 'none',
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"production"',
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COPYRIGHT_YEARS__: JSON.stringify(COPYRIGHT_YEARS),
    __SOURCE_URL__: JSON.stringify(SOURCE_URL),
  },
  external: ['node:buffer'],
  conditions: ['browser'],
  mainFields: ['browser', 'module', 'main'],
  nodePaths: [path.join(ROOT, 'node_modules')],
  logLevel: 'warning',
});
const appJs = app.outputFiles[0].text;

// ---- 2. vendor scripts (minified once) ------------------------------------------------------
// pdf.js 6.4.299, legacy build (see vendor/pdfjs6/SOURCE.md): the same code as the standard build,
// prepared by Mozilla for browsers that lack the newest JavaScript features, so the generator also
// runs in company browsers that are a few versions behind. The build stops if a vendored file is not
// the official one: each must have the SHA-256 of the file in Mozilla's attested npm package.
const PDFJS_FILES = {
  'vendor/pdfjs6/build/pdf.mjs': 'vFH0h0pm44UxictdUKukswlq+oPtQzuIXSk6PZRYPNw=',
  'vendor/pdfjs6/build/pdf.worker.mjs': 'u0IvYIBEd95KCwkJHYNHqRajh3Ve0cutJMyuwdCceL8=',
  'vendor/pdfjs6/wasm/jbig2.wasm': 'Rm9FwqYaaYFS+1QAwn5W/yzrc9y3H94/w2alAjCOqrA=',
  'vendor/pdfjs6/wasm/openjpeg.wasm': 'leUAJZevCCQASqV7GQD+AZcV2zieN2QLHlg5XkLwDMU=',
};
for (const [file, expected] of Object.entries(PDFJS_FILES)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('base64');
  if (actual !== expected) throw new Error(`${file} is not the official pdf.js file (SHA-256 ${actual}, expected ${expected})`);
}
// pdf.mjs is an ES module that also sets window.pdfjsLib; as a classic inline script it needs no
// module loader. The worker is turned into a classic script too: a page opened from disk cannot
// start a module worker from a blob: address (Chrome refuses it), but it can start a classic one.
// The worker's only use of import.meta is the address of its own script, which is self.location.
const pdfJs = (await esbuild.transform(read('vendor/pdfjs6/build/pdf.mjs'), { format: 'iife', minify: true, legalComments: 'none', target: 'es2022', logLevel: 'error' })).code;
const pdfWorkerJs = (await esbuild.transform(read('vendor/pdfjs6/build/pdf.worker.mjs'), { format: 'iife', minify: true, legalComments: 'none', target: 'es2022', define: { 'import.meta.url': 'self.location.href' } })).code;
if (/import\.meta/.test(pdfWorkerJs)) throw new Error('the pdf.js worker still uses import.meta');
// JBIG2 / CCITT (scanned pages) and JPEG 2000 images are decoded by pdf.js in WebAssembly.
const pdfWasm = Object.fromEntries(['jbig2.wasm', 'openjpeg.wasm']
  .map(name => [name, fs.readFileSync(path.join(ROOT, 'vendor/pdfjs6/wasm', name)).toString('base64')]));
const jszipJs = read('vendor/jszip.min.js');

// ---- 3. CSS ---------------------------------------------------------------------------------
// Tailwind CSS v3: the npm package if installed, otherwise the standalone binary in vendor/.
const twArgs = ['-c', 'tailwind.config.cjs', '-i', 'styles/app.css', '-o', 'dist/app.css', '--minify'];
let twCli = null;
try { twCli = require.resolve('tailwindcss/lib/cli.js'); } catch { /* not installed */ }
if (twCli) execFileSync(process.execPath, [twCli, ...twArgs], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
else execFileSync(path.join(ROOT, process.platform === 'win32' ? 'vendor/tailwindcss.exe' : 'vendor/tailwindcss'), twArgs, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
execFileSync(process.execPath, [path.join(ROOT, 'scripts/fonts.mjs')], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const fontsCss = read('dist/fonts.css');
const css = fontsCss + read('dist/app.css');

// ---- 4. assemble -----------------------------------------------------------------------------
// Inline scripts must not contain "</script" or "<!--" (they would end or confuse the script
// element). Both only occur inside strings, regexes and comments, where \x3C is equivalent.
const safe = (js) => js.replace(/<\/script/gi, '\\x3C/script').replace(/<!--/g, '\\x3C!--');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Converts reference material certificates (PDF) into Digital Reference Material Documents (DRMD XML).">
<!-- Security policy. Only the scripts built into this file can run (each one is listed by its SHA-256
     fingerprint), so injected code, inline event handlers and "javascript:" links are refused. The page
     may only talk to the AI providers listed below, PubChem, CAS Common Chemistry and ROR, and loads
     nothing else. -->
<meta http-equiv="Content-Security-Policy" content="__CSP__">
<title>DRMD AI Generator</title>
<!--
  DRMD AI Generator ${pkg.version}
  ${COPYRIGHT}
  Licensed under the EUPL v1.2
  Source code: ${SOURCE_URL}

  The development of the Digital Reference Material Document (DRMD) is partially funded and
  supported by the QI-Digital project (https://www.qi-digital.de/).

  One self-contained file: open it in Chrome or Edge. It also contains third-party software, each
  part under its own licence: React 18.3.1 (MIT), Google Gen AI SDK 1.52.0 (Apache-2.0), PDF.js
  6.4.299 (Apache-2.0) with its JBIG2 (Apache-2.0, BSD-3-Clause) and OpenJPEG (BSD-2-Clause)
  decoders, JSZip 3.10.1 (MIT), p-retry 4.6.2 and retry 0.13.1 (MIT), Tailwind CSS 3.4.17 (MIT)
  and the Inter 4.1 typeface (SIL Open Font License 1.1). The full text of the EUPL v1.2 and all
  third-party licences and copyright notices are at the end of this file.
-->
<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'styles/favicon-32.png')).toString('base64')}">
<link rel="icon" type="image/png" sizes="64x64" href="data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'styles/favicon-64.png')).toString('base64')}">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<noscript><p style="padding:2rem;font-family:sans-serif">The DRMD AI Generator needs JavaScript. Please open this file in Chrome or Edge.</p></noscript>
<script>${safe(jszipJs)}</script>
<script>${safe(pdfJs)}</script>
<script type="text/plain" id="pdf-worker-source">${safe(pdfWorkerJs)}</script>
<script type="text/plain" id="pdf-wasm-jbig2">${pdfWasm['jbig2.wasm']}</script>
<script type="text/plain" id="pdf-wasm-openjpeg">${pdfWasm['openjpeg.wasm']}</script>
<script>
(function () {
  // pdf.js reads PDFs in a Web Worker. A worker cannot be loaded from a file:// path, so it is
  // started from a Blob holding the worker code embedded above (see src/utils/pdfjs.ts).
  var lib = window.pdfjsLib, el = document.getElementById('pdf-worker-source');
  if (!lib || !el) return;
  var url = URL.createObjectURL(new Blob([el.textContent], { type: 'text/javascript' }));
  lib.GlobalWorkerOptions.workerSrc = url;
  // The worker address is this page's own blob: address. pdf.js would wrap any address it does not
  // recognise as same-origin (always the case when the file is opened from disk) in a second worker
  // that imports it; that is not needed.
  lib.PDFWorker._isSameOrigin = function () { return true; };
  el.parentNode.removeChild(el);
})();
</script>
<script>${safe(appJs)}</script>
<!--
${COPYRIGHT}
Licensed under the EUPL v1.2
Source code: ${SOURCE_URL}


${licenceText.trimEnd()}


${thirdPartyText.trimEnd()}
-->
</body>
</html>
`;

// ---- 5. security policy: allow exactly the inline scripts above, by their SHA-256 hashes ---------
const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
if (scriptHashes.length !== 4) throw new Error(`expected 4 inline scripts, found ${scriptHashes.length}`);
// wasm-unsafe-eval lets pdf.js compile its two WebAssembly image decoders (embedded above). It allows
// WebAssembly only, not JavaScript eval; which scripts may run is still decided by the hashes.
const csp = [
  "default-src 'none'",
  // blob: is the pdf.js worker code embedded above (started as a classic worker, see src/utils/pdfjs.ts).
  // Only this page can create blob: addresses, and nothing else may run in the first place.
  `script-src ${scriptHashes.join(' ')} blob: 'wasm-unsafe-eval'`,
  "worker-src blob:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "img-src data: blob:",
  "connect-src 'self' blob: data: https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://api.mistral.ai https://dashscope-intl.aliyuncs.com https://dashscope-us.aliyuncs.com https://dashscope.aliyuncs.com https://openrouter.ai https://pubchem.ncbi.nlm.nih.gov https://commonchemistry.cas.org https://api.ror.org",
  "frame-src 'none'",
  "media-src 'none'",
  "manifest-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const finalHtml = html.replace('__CSP__', csp);

const target = path.join(OUT, 'DRMD-Generator.html');
fs.writeFileSync(target, finalHtml);
console.log(`${path.relative(ROOT, target)}  ${(finalHtml.length / 1024 / 1024).toFixed(2)} MB  (app ${(appJs.length / 1024).toFixed(0)} kB, css ${(css.length / 1024).toFixed(0)} kB)`);
