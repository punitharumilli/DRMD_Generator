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

const results = []; const check = (name, ok, extra = '') => { results.push([ok, name]); if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const report = { scenarios: [], numbers: [], ai: [], speed: [] };

// ── 1 + 2. Units
const VALUE = '12.345';
const adminData = { title: 'T', uniqueIdentifier: 'X', documentVersion: '1', dataVersion: 1, documentIdentifiers: [], validityType: 'Until Revoked', durationY: 0, durationM: 0, dateOfIssue: '2026-01-01', specificTime: '', producers: [], responsiblePersons: [] };
const xmlFor = (rows) => G.buildDrmdXml({
  administrativeData: adminData, materials: [{ uuid: 'm1', name: 'M', description: '', minimumSampleSize: '', itemQuantities: '', materialIdentifiers: [] }],
  properties: [{ uuid: 'p1', name: 'P', description: '', isCertified: true, procedures: '', results: [{ uuid: 'r1', name: 'Table', description: '', quantities: rows }] }],
  statements: { official: {}, custom: [] }, comments: [], documents: [], generalComment: '', binaryDocuments: [],
});
const rowsXml = [];
for (const [i, sc] of SCENARIOS.entries()) {
  const r = D.toDsi(sc.unit, sc.ctx ? { texts: sc.ctx } : undefined);
  const expCls = sc.expect ? D.checkDsi(sc.expect).cls : 'improvable';
  let ok = r.dsi === sc.expect && r.cls === expCls;
  let detail = `got ${r.dsi || '(not converted)'} ${r.cls}: ${r.explanation}`;
  if (sc.rule) {
    // A typed D-SI string that breaks a rule: the rule must be named, with its page
    const c = D.checkDsi(sc.unit);
    const named = c.errors.some(e => e.rule === sc.rule);
    ok = ok && named;
    if (!named) detail += ` | rules named: ${c.errors.map(e => e.rule).join(',')}`;
  }
  check(`[${sc.cat}] ${JSON.stringify(sc.unit)}${sc.ctx ? ` (${sc.ctx[0]})` : ''} → ${sc.expect || '(not converted)'}`, ok, detail);
  report.scenarios.push({ ...sc, got: r.dsi, gotCls: r.cls, expCls, ok, explanation: r.explanation, page: r.page ?? null, notes: (r.notes || []).map(n => `${n.type}: ${n.text}`), ambiguous: !!r.ambiguous, noAi: !!r.noAi });
  rowsXml.push({ uuid: `q${i}`, name: `Row ${i}`, value: VALUE, unit: sc.unit, dsiValue: VALUE, dsiUnit: r.dsi, dsiSource: 'rules', uncertainty: '0.012', coverageFactor: '2', coverageProbability: '0.95', distribution: '', identifiers: [] });
}
// One document with every scenario as a row: the value must be written exactly, the unit as expected
const { xml, notes } = xmlFor(rowsXml);
const blocks = xml.split(/<drmd:quantity[ >]/).slice(1);
check('XML: one quantity per scenario', blocks.length === SCENARIOS.length, `${blocks.length} blocks for ${SCENARIOS.length} scenarios`);
let valuesOk = 0, unitsOk = 0, uncOk = 0;
SCENARIOS.forEach((sc, i) => {
  const b = blocks[i] || '';
  const value = (b.match(/<si:value>([^<]*)<\/si:value>/) || [])[1];
  const unit = (b.match(/<si:unit>([^<]*)<\/si:unit>/) || [])[1];
  const unc = (b.match(/<si:valueExpandedMU>([^<]*)</) || [])[1];
  const unescape = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const vOk = value === VALUE;
  const uOk = sc.expect ? unit === sc.expect : unescape(unit) === sc.unit.trim().replace(/\s+/g, '');
  if (vOk) valuesOk++; if (uOk) unitsOk++; if (unc === '0.012') uncOk++;
  report.scenarios[i].xmlValue = value ?? null; report.scenarios[i].xmlUnit = unit ?? null;
  if (!vOk || !uOk) check(`XML row ${JSON.stringify(sc.unit)}: value ${VALUE} unchanged and unit ${sc.expect || 'as typed'}`, false, `si:value ${value} si:unit ${unit}`);
});
check(`XML: the value is written exactly as printed in all ${SCENARIOS.length} rows`, valuesOk === SCENARIOS.length, `${valuesOk}`);
check(`XML: the expected D-SI unit (or the unit as typed) in all ${SCENARIOS.length} rows`, unitsOk === SCENARIOS.length, `${unitsOk}`);
check(`XML: the uncertainty is written exactly as given in all ${SCENARIOS.length} rows`, uncOk === SCENARIOS.length, `${uncOk}`);
const noteIds = notes.reduce((m, n) => (m[n.code] = (m[n.code] || 0) + 1, m), {});
report.xmlNotes = noteIds;
check('XML: notes in unit texts are reported (DSI-UNIT-ANNOTATION)', (noteIds['DSI-UNIT-ANNOTATION'] || 0) > 0);
check('XML: bronze units are reported (DSI-UNIT-BRONZE)', (noteIds['DSI-UNIT-BRONZE'] || 0) > 0);
check('XML: invalid typed D-SI units are errors (DSI-UNIT-INVALID)', (noteIds['DSI-UNIT-INVALID'] || 0) === 0, 'scenarios store no invalid D-SI unit (they were not converted)');
check('XML: no XML-breaking characters in any si:unit', !/<si:unit>[^<]*[<>"][^<]*<\/si:unit>/.test(xml));

// ── 3. Numbers (D-SI guide Section 4 p. 19; R003 p. 70)
const NUMBERS = [
  ['6.85', '6.85'], ['-0.5', '-0.5'], ['+0.5', '+0.5'], ['.5', '.5'], ['5.', '5.'], ['2E-4', '2E-4'], ['1.2E+3', '1.2E+3'], ['1.20 × 10⁹', '1.20e9'], ['1.2×10^-3', '1.2e-3'],
  ['1.2 x 10-3', '1.2e-3'], ['3.1·10⁵', '3.1e5'], ['−0.5', '-0.5'], ['0,85', '0.85'], ['12,5', '12.5'], ['0,001', '0.001'], ['1,2345', '1.2345'], ['1000,5', '1000.5'],
  ['100 000', '100000'], ['1 234', '1234'], ['1 234.5', '1234.5'], ['1 234,5', '1234.5'], ['12 345.678 9', '12345.6789'], ['0.000 12', '0.00012'], ['1 000 000', '1000000'],
  ['100 000', '100000'], ['100 000', '100000'], ["1'234.5", '1234.5'], ['1’234', '1234'], ['1,234.5', '1234.5'], ['1,234,567', '1234567'], ['1.234,5', '1234.5'], ['1.234.567', '1234567'],
  ['1,234', null, 'ambiguous'], ['12,345', null, 'ambiguous'], ['-1,234', null, 'ambiguous'], ['999,999', null, 'ambiguous'],
  ['12 15 18', null], ['< 0.5', null], ['<0.5', null], ['> 97.8', null], ['6.5 - 7.0', null], ['1.23 ± 0.05', null], ['(1.23)', null], ['1.23*', null], ['1/2', null], ['NaN', null],
  ['Infinity', null], ['1e400', null], ['0.50 %', null], ['n.d.', null], ['', null], ['12 34', null], ['1 23', null],
];
for (const [raw, want, flag] of NUMBERS) {
  const r = V.readNumber(raw);
  const ok = r.value === want && (!flag || !!r.ambiguous);
  check(`number ${JSON.stringify(raw)} → ${want ?? (flag ? 'ambiguous (not written)' : 'not a single number')}`, ok, JSON.stringify(r));
  report.numbers.push({ raw, want, wantAmbiguous: flag === 'ambiguous', got: r.value, ambiguous: !!r.ambiguous, grouped: r.grouped || null, ok });
}
// In the XML: an ambiguous number is an error and is written as text; digit groups are joined with a warning
{
  const row = (v) => ({ uuid: 'n', name: 'N', value: v, unit: 'mg/kg', dsiValue: v, dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}', dsiSource: 'rules', uncertainty: '', coverageFactor: '', coverageProbability: '', distribution: '', identifiers: [] });
  const amb = xmlFor([row('1,234')]);
  check('XML: "1,234" is not written as 1.234 or 1234 (error VALUE-AMBIGUOUS, written as text)', !/<si:value>/.test(amb.xml.split('propertiesList')[1]) && amb.notes.some(n => n.code === 'VALUE-AMBIGUOUS' && n.severity === 'error'));
  const grp = xmlFor([row('100 000')]);
  check('XML: "100 000" is one value 100000, not a list of two (warning VALUE-DIGIT-GROUPS)', /<si:value>100000<\/si:value>/.test(grp.xml) && !/realListXMLList/.test(grp.xml) && grp.notes.some(n => n.code === 'VALUE-DIGIT-GROUPS'));
  const lst = xmlFor([row('12 15 18')]);
  check('XML: "12 15 18" stays a list of three values', /<si:valueXMLList>12 15 18<\/si:valueXMLList>/.test(lst.xml));
  const empty = xmlFor([{ ...row('5.0'), unit: '', dsiUnit: '' }]);
  check('XML: a row without a unit is written with \\one and a warning (DSI-UNIT-EMPTY)', /<si:unit>\\one<\/si:unit>/.test(empty.xml) && empty.notes.some(n => n.code === 'DSI-UNIT-EMPTY'));
  const ann = xmlFor([{ ...row('0.85'), name: 'Mass fraction', unit: 'mg Hg/kg' }]);
  check('XML: "mg Hg/kg" → \\milli\\gram\\kilogram\\tothe{-1} with a warning to keep "Hg" in the quantity name', ann.notes.some(n => n.code === 'DSI-UNIT-ANNOTATION' && /"Hg"/.test(n.message)));
  const annNamed = xmlFor([{ ...row('0.85'), name: 'Mass fraction of Hg', unit: 'mg Hg/kg' }]);
  check('XML: no annotation warning when the quantity name already says "Hg"', !annNamed.notes.some(n => n.code === 'DSI-UNIT-ANNOTATION'));
  const typed = xmlFor([{ ...row('3'), unit: 'm/s', dsiUnit: '\\metre\\per\\second', dsiSource: 'manual' }]);
  check('XML: a valid D-SI 2 unit typed with \\per is kept as typed', /<si:unit>\\metre\\per\\second<\/si:unit>/.test(typed.xml) && !typed.notes.some(n => n.code === 'DSI-UNIT-INVALID'));
  const bad = xmlFor([{ ...row('3'), unit: 'kg', dsiUnit: '\\kilo\\gram', dsiSource: 'manual' }]);
  check('XML: an invalid typed D-SI unit is an error that names the rule and its page (R011, D-SI guide p. 72)', bad.notes.some(n => n.code === 'DSI-UNIT-INVALID' && /R011, D-SI guide p\. 72/.test(n.message)));
  const mism = xmlFor([{ ...row('3'), unit: 'mg/kg', dsiUnit: '\\gram\\kilogram\\tothe{-1}', dsiSource: 'manual' }]);
  check('XML: a typed D-SI unit of another size is kept (value unchanged) with a warning', /<si:value>3<\/si:value>/.test(mism.xml) && mism.notes.some(n => n.code === 'DSI-UNIT-MISMATCH'));
}

// ── 4. The AI's answers: only notes may be left out; never numbers, powers of ten, "/" or unit symbols
const AI = [
  ['mg/kg dry mass', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}' }, [], true, 'basis note left out'],
  ['mg/kg N', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}' }, ['Total nitrogen'], true, 'element named in the context'],
  ['mg/kg N', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}' }, ['Total N (Kjeldahl)'], true, 'symbol named in the quantity name'],
  ['mg/kg N', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}' }, ['Force per mass'], false, 'context does not name nitrogen'],
  ['kg/(m³ K)', { cleanUnit: 'kg/(m³ K)', dsiUnit: '\\kilogram\\metre\\tothe{-3}\\kelvin\\tothe{-1}' }, ['Temperature coefficient of density'], true, 'K kept as a unit'],
  ['kg/(m³ K)', { cleanUnit: 'kg/m³', dsiUnit: '\\kilogram\\metre\\tothe{-3}' }, ['Temperature coefficient of density'], false, 'K dropped without potassium in the context'],
  ['10⁻⁶/K', { cleanUnit: 'K', dsiUnit: '\\kelvin' }, [], false, 'drops 10⁻⁶ and the division'],
  ['×10⁻⁶ K⁻¹', { cleanUnit: 'K⁻¹', dsiUnit: '\\kelvin\\tothe{-1}' }, [], false, 'drops 10⁻⁶'],
  ['IU/mL', { cleanUnit: 'mL', dsiUnit: '\\milli\\litre' }, [], false, 'IU is not a note'],
  ['mg KOH/g', { cleanUnit: 'g', dsiUnit: '\\gram' }, [], false, 'drops mg and /'],
  ['cfu/g', { cleanUnit: 'g', dsiUnit: '\\gram\\tothe{-1}' }, [], false, 'cfu is not a note'],
  ['g per 100 g', { cleanUnit: 'g', dsiUnit: '\\gram' }, [], false, 'drops per 100 g'],
  ['mg/kg (on dry basis, ×10⁻³)', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}' }, [], false, 'drops ×10⁻³'],
  ['ppb', { cleanUnit: 'ppb', dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', quantityKind: 'mass fraction', evidence: 'mass fraction' }, ['Mass fraction of Hg'], true, 'kind quoted from the text'],
  ['ppb', { cleanUnit: 'ppb', dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', quantityKind: 'mass fraction', evidence: 'mass fraction' }, ['Concentration of Hg'], false, 'quoted kind is not in the text'],
  ['ppb', { cleanUnit: 'ppb', dsiUnit: '\\nano\\mole\\mole\\tothe{-1}', quantityKind: 'mass fraction', evidence: 'mass fraction' }, ['Mass fraction of Hg'], false, 'amount fraction for a mass fraction'],
  ['°F', { cleanUnit: '°F', dsiUnit: '\\degreecelsius' }, [], false, 'different scale'],
  ['C', { cleanUnit: 'C', dsiUnit: '\\degreecelsius' }, ['Melting temperature'], true, 'temperature context'],
  ['C', { cleanUnit: 'C', dsiUnit: '\\degreecelsius' }, ['Electric charge'], false, 'charge context'],
  ['mg/L', { cleanUnit: 'mg/L', dsiUnit: '\\milli\\gram\\metre\\tothe{-3}' }, [], false, '1000 × too small (mg/m³)'],
  ['mg/kg', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\mole\\mole\\tothe{-1}' }, [], false, 'same size, other quantity'],
  ['%', { cleanUnit: '%', dsiUnit: '\\centi\\gram\\gram\\tothe{-1}' }, [], false, 'named unit replaced'],
  ['Bq', { cleanUnit: 'Bq', dsiUnit: '\\hertz' }, [], false, 'named unit replaced'],
  ['bar', { cleanUnit: 'bar', dsiUnit: '\\hecto\\kilo\\pascal' }, [], false, 'breaks R009'],
  ['m/s', { cleanUnit: 'm/s', dsiUnit: '\\metre\\per\\second' }, [], false, '\\per (silver) instead of \\tothe{-1}'],
  ['mg/kg', { cleanUnit: 'mg/kg', dsiUnit: '\\milli\\gram\\kilo\\gram\\tothe{-1}' }, [], false, 'breaks R011'],
  ['HV', { cleanUnit: 'HV', dsiUnit: '\\henry\\volt' }, [], false, 'hardness scale'],
  ['pH', { cleanUnit: 'pH', dsiUnit: '\\pico\\henry' }, [], false, 'pH is not picohenry'],
  ['% (w/v)', { cleanUnit: '% (w/v)', dsiUnit: '\\percent' }, [], false, 'w/v is a mass concentration'],
  ['% (w/v)', { cleanUnit: '%', dsiUnit: '\\gram\\deci\\litre\\tothe{-1}' }, [], true, 'w/v as g/dL'],
  ['rad', { cleanUnit: 'rad', dsiUnit: '\\radian' }, ['Absorbed dose'], false, 'rad in a dose'],
  ['µg/L as N', { cleanUnit: 'µg/L', dsiUnit: '\\micro\\gram\\litre\\tothe{-1}' }, [], true, '"as N" left out'],
  ['MG/KG', { cleanUnit: 'MG/KG', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}' }, [], true, 'capitals'],
];
for (const [unit, answer, ctx, want, why] of AI) {
  const v = D.acceptAiUnit(unit, answer, ctx);
  check(`AI answer for ${JSON.stringify(unit)} ${answer.dsiUnit} (${why}): ${want ? 'used' : 'refused'}`, v.ok === want, v.ok ? v.dsi : v.reason);
  report.ai.push({ unit, ctx: ctx.join('; '), cleanUnit: answer.cleanUnit, dsiUnit: answer.dsiUnit, why, want, got: v.ok, reason: v.ok ? '' : v.reason });
}

// ── 5. Speed: no unit text can freeze the page (it is read on every key press)
for (const s of ['m'.repeat(40) + 'x', 'mg'.repeat(30), 'ms'.repeat(30) + 'q', 'a'.repeat(119), 'm'.repeat(500), 'mg/kg '.repeat(20), '('.repeat(60) + 'm' + ')'.repeat(60), '10^'.repeat(40) + 'm']) {
  const t = process.hrtime.bigint(); D.toDsi(s); D.analyzeUnit(s); const ms = Number(process.hrtime.bigint() - t) / 1e6;
  check(`speed: ${JSON.stringify(s.slice(0, 16) + '…')} (${s.length} characters) read in < 50 ms`, ms < 50, `${ms.toFixed(1)} ms`);
  report.speed.push({ input: `${s.slice(0, 24)}… (${s.length} characters)`, ms: Number(ms.toFixed(2)) });
}

fs.mkdirSync(path.join(__dirname, 'out-matrix'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out-matrix', 'matrix.json'), JSON.stringify(report, null, 1));
const failed = results.filter(r => !r[0]).length;
console.log(failed === 0 ? `\n${results.length}/${results.length} checks passed` : `\n${failed} of ${results.length} checks FAILED`);
process.exit(failed ? 1 : 0);
