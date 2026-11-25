// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// The business rules embedded in the generator (src/utils/drmdBusinessRules.ts) must be exactly the
// official rule file drmd-business-rules.sch of the DRMD schema repository: the same patterns, rules,
// rule contexts, assertion ids, roles, XPath tests and messages, in the same order, with the same
// namespaces and the same schemaVersion. Whitespace runs are compared as one space (the embedded copy
// collapses the line breaks of the file).
//
// Run: node test/rules-unit.cjs [path to drmd-business-rules.sch]
// Default path: the environment variable DRMD_RULES, or ../../drmd-schema/drmd-business-rules.sch next to
// this repository (a clone of the DRMD schema repository).
const fs = require('fs');
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/utils/drmdBusinessRules.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
const { SCHEMATRON_PATTERNS, SCHEMATRON_NAMESPACES, DRMD_SCHEMA_VERSION } = mod.exports;

const file = process.argv[2] || process.env.DRMD_RULES || path.join(__dirname, '../../../drmd-schema/drmd-business-rules.sch');
if (!fs.existsSync(file)) { console.error(`Rule file not found: ${file}. Pass the path of drmd-business-rules.sch.`); process.exit(2); }
const text = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const ws = (s) => String(s).replace(/\s+/g, ' ').trim();
const ent = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attrs = (tag) => { const o = {}; for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) o[m[1]] = ent(m[3] ?? m[4]); return o; };

// The official file, read in document order
const official = { version: '', ns: {}, patterns: [] };
const schemaTag = text.match(/<sch:schema\b[^>]*>/);
official.version = schemaTag ? attrs(schemaTag[0]).schemaVersion || '' : '';
for (const m of text.matchAll(/<sch:ns\b[^>]*\/?>/g)) { const a = attrs(m[0]); official.ns[a.prefix] = a.uri; }
let pattern = null, rule = null;
const re = /<sch:pattern\b[^>]*>|<\/sch:pattern>|<sch:rule\b[^>]*>|<\/sch:rule>|<sch:(assert|report)\b([^>]*)>([\s\S]*?)<\/sch:\1>/g;
for (const m of text.matchAll(re)) {
  const t = m[0];
  if (t.startsWith('<sch:pattern')) { pattern = { id: attrs(t).id, rules: [] }; official.patterns.push(pattern); }
  else if (t === '</sch:pattern>') pattern = null;
  else if (t.startsWith('<sch:rule')) { rule = { context: attrs(t).context, checks: [] }; pattern.rules.push(rule); }
  else if (t === '</sch:rule>') rule = null;
  else {
    const a = attrs(`<x ${m[2]}>`);
    if (/<sch:/.test(m[3])) throw new Error(`${a.id}: the message contains Schematron elements, which the embedded copy cannot hold`);
    rule.checks.push({ kind: m[1], id: a.id, role: a.role || 'error', test: a.test, message: ent(m[3]) });
  }
}

const results = []; const check = (name, ok, extra = '') => { results.push([ok, name]); if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const count = (ps) => ps.reduce((n, p) => n + p.rules.reduce((k, r) => k + r.checks.length, 0), 0);
check(`schemaVersion: ${official.version} (file) = ${DRMD_SCHEMA_VERSION} (embedded)`, official.version === DRMD_SCHEMA_VERSION);
check('namespaces are the same', JSON.stringify(official.ns) === JSON.stringify(SCHEMATRON_NAMESPACES), JSON.stringify(official.ns));
check(`patterns: ${official.patterns.length} in the file, ${SCHEMATRON_PATTERNS.length} embedded`, official.patterns.length === SCHEMATRON_PATTERNS.length);
check(`assertions: ${count(official.patterns)} in the file, ${count(SCHEMATRON_PATTERNS)} embedded`, count(official.patterns) === count(SCHEMATRON_PATTERNS));
official.patterns.forEach((p, i) => {
  const e = SCHEMATRON_PATTERNS[i] || { id: '(missing)', rules: [] };
  check(`pattern ${i + 1}: id ${p.id}`, p.id === e.id, e.id);
  check(`pattern ${p.id}: ${p.rules.length} rules`, p.rules.length === e.rules.length, String(e.rules.length));
  p.rules.forEach((r, j) => {
    const er = e.rules[j] || { context: '(missing)', checks: [] };
    check(`pattern ${p.id}, rule ${j + 1}: same context`, ws(r.context) === ws(er.context), `${ws(r.context)} | ${ws(er.context)}`);
    r.checks.forEach((c, k) => {
      const ec = er.checks[k] || {};
      for (const f of ['kind', 'id', 'role']) check(`${c.id}: same ${f}`, c[f] === ec[f], `${c[f]} | ${ec[f]}`);
      check(`${c.id}: same XPath test`, ws(c.test) === ws(ec.test), `${ws(c.test)} | ${ws(ec.test)}`);
      check(`${c.id}: same message`, ws(c.message) === ws(ec.message));
    });
    check(`pattern ${p.id}, rule ${j + 1}: no extra embedded checks`, r.checks.length === er.checks.length);
  });
});
const failed = results.filter(r => !r[0]).length;
console.log(failed === 0 ? `\n${results.length}/${results.length} checks passed (${path.basename(file)}: ${count(official.patterns)} assertions in ${official.patterns.length} patterns)` : `\n${failed} of ${results.length} checks FAILED`);
process.exit(failed ? 1 : 0);
