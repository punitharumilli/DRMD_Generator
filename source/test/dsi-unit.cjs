// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Rule engine for D-SI units (src/utils/dsi.ts), checked against the D-SI guide v1.3
// (SmartCom, DOI 10.5281/zenodo.3816686): identifiers, classes, rules R007–R015, and above all that a
// value is never changed by chance: only a power of ten moves into the number, and a unit outside the SI
// is written in si:hybrid with the value as printed beside the converted one.
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/utils/dsi.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
const { toDsi, checkDsi, verifySameUnit, unitWriting, hybridValue, writtenValueText } = mod.exports;
const V = (() => { const o = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/utils/xmlValues.ts')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' }); const m = { exports: {} }; new Function('module', 'exports', 'require', o.outputFiles[0].text)(m, m.exports, require); return m.exports; })();

const results = []; const check = (name, ok, extra = '') => { results.push([ok, name]); if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const ctx = (...texts) => ({ texts });

// [unit as written, expected D-SI ('' = none), expected class, context]
const CASES = [
  // SI base units and SI++ (platinum, Tables A.1/A.2)
  ['m', '\\metre', 'platinum'], ['kg', '\\kilogram', 'platinum'], ['s', '\\second', 'platinum'], ['K', '\\kelvin', 'platinum'],
  ['mol', '\\mole', 'platinum'], ['cd', '\\candela', 'platinum'], ['A', '\\ampere', 'platinum'],
  ['min', '\\minute', 'platinum'], ['h', '\\hour', 'platinum'], ['d', '\\day', 'platinum'], ['°', '\\degree', 'platinum'],
  ['1', '\\one', 'platinum'], ['m/s', '\\metre\\second\\tothe{-1}', 'platinum'], ['m²', '\\metre\\tothe{2}', 'platinum'],
  ['kg/m³', '\\kilogram\\metre\\tothe{-3}', 'platinum'], ['kg m-3', '\\kilogram\\metre\\tothe{-3}', 'platinum'],
  ['mol/mol', '\\mole\\mole\\tothe{-1}', 'platinum'], ['min-1', '\\minute\\tothe{-1}', 'platinum'],
  // prefixes and SI derived units (gold)
  ['mg/kg', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'], ['mg kg-1', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'],
  ['mg·kg⁻¹', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'], ['mgkg-1', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'],
  ['µg/kg', '\\micro\\gram\\kilogram\\tothe{-1}', 'gold'], ['μg/kg', '\\micro\\gram\\kilogram\\tothe{-1}', 'gold'], ['ug/kg', '\\micro\\gram\\kilogram\\tothe{-1}', 'gold'],
  ['µg/g', '\\micro\\gram\\gram\\tothe{-1}', 'gold'], ['g/kg', '\\gram\\kilogram\\tothe{-1}', 'gold'], ['g/100 g', '\\gram\\hecto\\gram\\tothe{-1}', 'gold'],
  ['g/100g', '\\gram\\hecto\\gram\\tothe{-1}', 'gold'], ['mmol/kg', '\\milli\\mole\\kilogram\\tothe{-1}', 'gold'], ['g/mol', '\\gram\\mole\\tothe{-1}', 'gold'],
  ['mg', '\\milli\\gram', 'gold'], ['g', '\\gram', 'gold'], ['µm', '\\micro\\metre', 'gold'], ['nm', '\\nano\\metre', 'gold'], ['cm', '\\centi\\metre', 'gold'],
  ['g/cm3', '\\gram\\centi\\metre\\tothe{-3}', 'gold'], ['g/cm³', '\\gram\\centi\\metre\\tothe{-3}', 'gold'],
  ['m2/g', '\\metre\\tothe{2}\\gram\\tothe{-1}', 'gold'], ['m²/g', '\\metre\\tothe{2}\\gram\\tothe{-1}', 'gold'],
  ['°C', '\\degreecelsius', 'gold'], ['℃', '\\degreecelsius', 'gold'], ['Pa', '\\pascal', 'gold'], ['kPa', '\\kilo\\pascal', 'gold'], ['hPa', '\\hecto\\pascal', 'gold'],
  ['S', '\\siemens', 'gold'], ['mS/m', '\\milli\\siemens\\metre\\tothe{-1}', 'gold'], ['µS/cm', '\\micro\\siemens\\centi\\metre\\tothe{-1}', 'gold'],
  ['Bq', '\\becquerel', 'gold'], ['Bq/kg', '\\becquerel\\kilogram\\tothe{-1}', 'gold'], ['kBq/g', '\\kilo\\becquerel\\gram\\tothe{-1}', 'gold'],
  ['N m', '\\newton\\metre', 'gold'], ['Nm', '\\newton\\metre', 'gold'], ['mPa s', '\\milli\\pascal\\second', 'gold'], ['mPa·s', '\\milli\\pascal\\second', 'gold'],
  ['J/(g K)', '\\joule\\gram\\tothe{-1}\\kelvin\\tothe{-1}', 'gold'], ['kJ/mol', '\\kilo\\joule\\mole\\tothe{-1}', 'gold'], ['Hz', '\\hertz', 'gold'],
  ['ms', '\\milli\\second', 'gold'], ['°C/min', '\\degreecelsius\\minute\\tothe{-1}', 'gold'],
  // powers of ten written with the unit: written in the number (valueExp), the unit keeps its symbols
  ['x 10³ g/mol', '\\gram\\mole\\tothe{-1}', 'gold'], ['10^3 g/mol', '\\gram\\mole\\tothe{-1}', 'gold'],
  ['×10^-3 m', '\\metre', 'platinum'], ['MPa mm', '\\kilo\\pascal\\metre', 'gold'],
  // CGS units that are exactly a D-SI expression
  ['cP', '\\milli\\pascal\\second', 'gold'], ['P', '\\deci\\pascal\\second', 'gold'], ['cSt', '\\milli\\metre\\tothe{2}\\second\\tothe{-1}', 'gold'],
  // accepted for use with the SI (silver)
  ['mg/L', '\\milli\\gram\\litre\\tothe{-1}', 'silver'], ['µg/mL', '\\micro\\gram\\milli\\litre\\tothe{-1}', 'silver'], ['ng/µL', '\\nano\\gram\\micro\\litre\\tothe{-1}', 'silver'],
  ['mol/L', '\\mole\\litre\\tothe{-1}', 'silver'], ['M', '\\mole\\litre\\tothe{-1}', 'silver'], ['mM', '\\milli\\mole\\litre\\tothe{-1}', 'silver'], ['µM', '\\micro\\mole\\litre\\tothe{-1}', 'silver'],
  ['mL', '\\milli\\litre', 'silver'], ['L', '\\litre', 'silver'], ['t', '\\tonne', 'silver'], ['ha', '\\hectare', 'silver'], ['eV', '\\electronvolt', 'silver'], ['Da', '\\dalton', 'silver'], ['dB', '\\decibel', 'silver'],
  // 8th SI brochure only (bronze); value never converted to pascal
  ['bar', '\\bar', 'bronze'], ['mbar', '\\milli\\bar', 'bronze'], ['mmHg', '\\mmhg', 'bronze'], ['mm Hg', '\\mmhg', 'bronze'], ['Å', '\\angstrom', 'bronze'],
  // % and ppm: D-SI 2 identifiers (gold)
  ['%', '\\percent', 'gold'], ['% (m/m)', '\\percent', 'gold'], ['mass %', '\\percent', 'gold'], ['wt.%', '\\percent', 'gold'], ['% (v/v)', '\\percent', 'gold'], ['ppm', '\\ppm', 'gold'],
  ['in %', '\\percent', 'gold'], ['[mg/kg]', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'], ['(mg/kg)', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'], ['MG/KG', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'],
  // ratios without an identifier: only with a stated kind of fraction
  ['ppb', '\\micro\\gram\\kilogram\\tothe{-1}', 'gold', ctx('Mass fraction of Pb')], ['ppb (m/m)', '\\micro\\gram\\kilogram\\tothe{-1}', 'gold'],
  ['ppb', '\\nano\\mole\\mole\\tothe{-1}', 'gold', ctx('Amount fraction of CO2 in nitrogen')], ['ppb', '\\nano\\litre\\litre\\tothe{-1}', 'silver', ctx('Volume fraction')],
  ['ppb', '\\ppm', 'gold'], ['‰', '\\gram\\kilogram\\tothe{-1}', 'gold', ctx('mass fraction')], ['‰', '\\one', 'gold', ctx('δ13C vs VPDB')],
  // outside the SI with a defined conversion: si:hybrid with the SI unit first (at best gold, R054)
  ['lb', '\\kilogram', 'gold'], ['ft', '\\metre', 'gold'], ['inch', '\\milli\\metre', 'gold'], ['psi', '\\kilo\\pascal', 'gold'], ['atm', '\\kilo\\pascal', 'gold'],
  ['°F', '\\kelvin', 'gold'], ['dyn', '\\newton', 'gold'], ['Oe', '\\ampere\\metre\\tothe{-1}', 'gold'],
  // no defined conversion (several definitions, scales, counts): never converted
  ['oz', '', 'improvable'], ['cal', '', 'improvable'], ['gal', '', 'improvable'], ['HRC', '', 'improvable'], ['IU/mL', '', 'improvable'], ['cfu/g', '', 'improvable'],
  // names and abbreviations (expert test cases), and letters that are never split wrongly
  ['Ohm', '\\ohm', 'gold'], ['sec', '\\second', 'platinum'], ['kOhm', '\\kilo\\ohm', 'gold'], ['msec', '\\milli\\second', 'gold'], ['mcg', '\\micro\\gram', 'gold'],
  ['Kg', '', 'improvable'], ['kgs', '', 'improvable'], ['mins', '\\minute', 'platinum'], ['amu', '\\dalton', 'silver'], ['emu', '', 'improvable'],
  ['emu', '\\milli\\ampere\\metre\\tothe{2}', 'gold', ctx('Magnetic moment')],
  // a note about the basis is not part of the unit: kept out of the D-SI unit (and reported)
  ['mg/kg dry mass', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'],
  // "C": coulomb by the SI symbol, degree Celsius only when the text is about temperature
  ['C', '\\degreecelsius', 'gold', ctx('Melting temperature')], ['C', '\\coulomb', 'gold', ctx('Electric charge')], ['C', '', 'improvable'],
  // already D-SI: checked, kept
  ['\\milli\\gram\\kilogram\\tothe{-1}', '\\milli\\gram\\kilogram\\tothe{-1}', 'gold'], ['\\kilo\\gram', '', 'improvable'],
];
for (const [unit, dsi, cls, c] of CASES) {
  const r = toDsi(unit, c);
  check(`${JSON.stringify(unit)}${c ? ` [${c.texts[0]}]` : ''} → ${dsi || '(none)'} ${cls}`, r.dsi === dsi && r.cls === cls, `got ${r.dsi || '(none)'} ${r.cls}: ${r.explanation}`);
}

// Rules of Appendix C on D-SI strings
const RULES = [
  ['\\kilo\\gram', 'R011'], ['\\deci\\bel', 'R012'], ['\\metre\\tothe{1.5}', 'R013'], ['\\metre\\tothe{02}', 'R013'], ['\\one\\tothe{2}', 'R014'],
  ['\\milli\\kilogram', 'R010'], ['\\milli\\hour', 'R010'], ['\\kilo\\degreecelsius', 'R010'], ['\\milli\\one', 'R010'], ['\\milli\\minute', 'R010'], ['\\kilo\\day', 'R010'], ['\\kilo\\mmhg', 'R010'],
  ['\\milli\\micro\\metre', 'R009'], ['\\metre\\tothe{2}\\tothe{3}', 'R009'], ['\\milli\\gram\\milli\\litre\\tothe{-1}\\centi\\metre\\tothe{-1}', 'R015'], ['\\milli\\metre\\kilo\\pascal', 'R015'],
  ['\\Metre', 'R007'], ['\\metre \\second', 'R007'], ['\\meter', 'R008'], ['mg/kg', 'R008'], ['\\percent\\tothe{2}', 'D-SI 2.2.1'], ['\\milli\\percent', 'D-SI 2.2.1'],
];
for (const [s, rule] of RULES) {
  const c = checkDsi(s);
  check(`${s} breaks ${rule}`, !c.ok && c.errors.some(e => e.rule === rule), c.errors.map(e => e.rule).join(','));
}
for (const s of ['\\metre\\tothe{0.5}', '\\metre\\tothe{-0.5}', '\\metre\\tothe{+2}', '\\metre\\tothe{0}', '\\micro\\gram\\milli\\litre\\tothe{-1}', '\\kilogram\\metre\\tothe{-3}']) {
  check(`${s} is valid`, checkDsi(s).ok, checkDsi(s).errors.map(e => e.rule).join(','));
}
check('class of \\metre\\second\\tothe{-1} is platinum', checkDsi('\\metre\\second\\tothe{-1}').cls === 'platinum');
check('a prefix makes a platinum unit gold (R018)', checkDsi('\\milli\\metre').cls === 'gold');
check('class of \\milli\\bar is bronze', checkDsi('\\milli\\bar').cls === 'bronze');

// Verification of answers: same size, same quantity, same named units
const VERIFY = [
  ['mg/kg', '\\milli\\gram\\kilogram\\tothe{-1}', true], ['mg/kg', '\\one', false], ['mg/kg', '\\milli\\mole\\mole\\tothe{-1}', false],
  ['mg/kg', '\\micro\\gram\\gram\\tothe{-1}', true], ['%', '\\centi\\gram\\gram\\tothe{-1}', false], ['%', '\\percent', true], ['ppm', '\\micro\\gram\\gram\\tothe{-1}', false],
  ['Bq', '\\hertz', false], ['Bq', '\\becquerel', true], ['bar', '\\pascal', false], ['bar', '\\hecto\\kilo\\pascal', false], ['bar', '\\bar', true],
  ['cP', '\\milli\\pascal\\second', true], ['cP', '\\pascal\\second', false], ['°C', '\\kelvin', false], ['°C', '\\degreecelsius', true],
  ['lb', '\\kilogram', true], ['lb', '\\gram', false], ['x 10³ g/mol', '\\kilogram\\mole\\tothe{-1}', true], ['x 10³ g/mol', '\\gram\\mole\\tothe{-1}', true], ['x 10³ g/mol', '\\milli\\gram\\mole\\tothe{-1}', false],
  ['% (w/v)', '\\gram\\deci\\litre\\tothe{-1}', true], ['% (w/v)', '\\gram\\litre\\tothe{-1}', true], ['% (w/v)', '\\percent', false], ['mg/L', '\\milli\\gram\\metre\\tothe{-3}', false],
  ['M', '\\mole\\litre\\tothe{-1}', true], ['M', '\\kilo\\mole\\metre\\tothe{-3}', true], ['M', '\\mole\\metre\\tothe{-3}', false],
];
for (const [unit, dsi, want] of VERIFY) {
  const v = verifySameUnit(unit, dsi);
  check(`verify "${unit}" as ${dsi}: ${want ? 'accepted' : 'refused'}`, v.ok === want, v.reason);
}
// The power of ten in the number, where the D-SI unit leaves it out; never where the D-SI unit has it
check('verify "x 10³ g/mol" as \\gram\\mole\\tothe{-1}: the number gets e3', verifySameUnit('x 10³ g/mol', '\\gram\\mole\\tothe{-1}').valueExp === 3);
check('verify "x 10³ g/mol" as \\kilogram\\mole\\tothe{-1}: the number stays (the prefix has the power)', verifySameUnit('x 10³ g/mol', '\\kilogram\\mole\\tothe{-1}').valueExp === 0);
check('verify "% (w/v)" as \\gram\\litre\\tothe{-1}: the number times 10 (e1); as g/dL: unchanged', verifySameUnit('% (w/v)', '\\gram\\litre\\tothe{-1}').valueExp === 1 && verifySameUnit('% (w/v)', '\\gram\\deci\\litre\\tothe{-1}').valueExp === 0);
check('verify "ppb" as \\ppm without a kind: si:hybrid with e-3', (() => { const v = verifySameUnit('ppb', '\\ppm'); return v.ok && v.valueExp === -3 && v.hybrid && v.hybrid.asWritten === 'ppb'; })());

// How a value is written (unitWriting): a D-SI unit chosen by the AI or typed by hand keeps the number
check('unitWriting: ppb as \\micro\\gram\\kilogram\\tothe{-1} (kind decided by the AI): the number unchanged, no hybrid', (() => { const w = unitWriting('ppb', '\\micro\\gram\\kilogram\\tothe{-1}'); return w.ok && w.valueExp === 0 && !w.hybrid; })());
check('unitWriting: a typed D-SI unit of another size is not ok (the value is written unchanged, with a warning)', !unitWriting('mg/kg', '\\gram\\kilogram\\tothe{-1}').ok);
check('unitWriting: lb as \\kilogram is si:hybrid, class gold', (() => { const w = unitWriting('lb', '\\kilogram'); return w.ok && w.hybrid && w.hybrid.def && w.cls === 'gold'; })());
check('unitWriting: "% (m/m)" gives QUDT MassFraction; "%" alone none', unitWriting('% (m/m)', '\\percent').qudt === 'MassFraction' && !unitWriting('%', '\\percent').qudt);
check('unitWriting: ‰ in a δ13C value gets si:label δ13CVPDB', unitWriting('‰ vs VPDB', '\\one', ctx('δ13C')).label === 'δ13CVPDB');
check('writtenValueText: "150" lb → si:hybrid with 68.039 \\kilogram and 150 lb', writtenValueText('150', '\\kilogram', unitWriting('lb', '\\kilogram')) === 'si:hybrid with 68.039 \\kilogram and 150 lb');

// Exact decimal arithmetic (no floating point): shifting a power of ten and converting with a factor
const SHIFT = [['196.4', 3, '196.4e3'], ['5', -3, '5e-3'], ['1.2e-3', 3, '1.2'], ['-0.52', 1, '-0.52e1'], ['0.012', 0, '0.012'], ['1.20E2', -2, '1.20']];
for (const [v, n, want] of SHIFT) check(`shiftDecimal(${v}, ${n}) = ${want}`, V.shiftDecimal(v, n) === want, V.shiftDecimal(v, n));
const B = (x) => BigInt(x);
const CONV = [
  ['150', B(45359237), B(100000000), B(0), B(1), false, '68.039'], ['0.5', B(45359237), B(100000000), B(0), B(1), true, '0.2268'],
  ['98.6', B(5), B(9), B(45967), B(180), false, '310.1500'], ['32', B(5), B(9), B(45967), B(180), false, '273.150'], ['-40', B(5), B(9), B(45967), B(180), false, '233.150'],
  ['0.5', B(5), B(9), B(45967), B(180), true, '0.2778'], ['1.5', B(37), B(1), B(0), B(1), false, '55.50'], ['14.7', B('44482216152605'), B('6451600000000'), B(0), B(1), false, '101.353'],
  ['0.00012', B(254), B(10), B(0), B(1), false, '0.003048'], ['2.5E3', B(3048), B(10000), B(0), B(1), false, '762.0'], ['12345678', B(3048), B(10000), B(0), B(1), false, '3762962.654'],
];
for (const [v, n, d, on, od, unc, want] of CONV) {
  const got = V.convertDecimal(v, n, d, on, od, unc);
  check(`convertDecimal(${v} × ${n}/${d}${unc ? '' : ` + ${on}/${od}`}) = ${want}`, got === want, got);
}
check('convertDecimal: not a number → null', V.convertDecimal('1,234', B(1), B(1)) === null && V.convertDecimal('< 2', B(1), B(1)) === null);
check('hybridValue: G (10⁻⁴ T exactly) writes 12.345e-4, nothing rounded', hybridValue('12.345', { si: '\\tesla', name: 'gauss', pow: -4, definition: '' }) === '12.345e-4');

check('ppb as a mass fraction: accepted only with the kind', verifySameUnit('ppb', '\\micro\\gram\\kilogram\\tothe{-1}', 'mass').ok && !verifySameUnit('ppb', '\\micro\\gram\\kilogram\\tothe{-1}').ok && !verifySameUnit('ppb', '\\micro\\gram\\kilogram\\tothe{-1}', 'amount').ok);

const failed = results.filter(r => !r[0]).length;
console.log(failed === 0 ? `\n${results.length}/${results.length} checks passed` : `\n${failed} of ${results.length} checks FAILED`);
process.exit(failed ? 1 : 0);
