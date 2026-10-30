// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Unit scenarios for the D-SI conversion, with the expected result written from the SI brochure and the
// D-SI guide v1.3 (SmartCom, DOI 10.5281/zenodo.3816686; pages as printed) and the D-SI 2.2.1 unit list
// (PTB, DOI 10.5281/zenodo.12200678). Expected results are NOT taken from the generator.
//
// Each scenario: { cat, unit, expect, ctx?, why?, cite? }
//   expect: the D-SI unit the generator must write, or '' when it must NOT convert the unit (it is then
//           written as typed, class "improvable", and the value is never changed).
//   cite:   where the deciding rule is in the sources.

const P = { // prefixes of Table A.5 (p. 53): symbol → identifier
  da: 'deca', h: 'hecto', k: 'kilo', M: 'mega', G: 'giga', T: 'tera', P: 'peta', E: 'exa', Z: 'zetta', Y: 'yotta',
  d: 'deci', c: 'centi', m: 'milli', 'µ': 'micro', n: 'nano', p: 'pico', f: 'femto', a: 'atto', z: 'zepto', y: 'yocto',
};
const S = [];
const add = (cat, unit, expect, extra = {}) => S.push({ cat, unit, expect, ...extra });

// ── 1. SI base units with every prefix (Table A.1 p. 47, Table A.5 p. 53, R017/R018 p. 74)
const BASE = [['m', 'metre'], ['s', 'second'], ['A', 'ampere'], ['K', 'kelvin'], ['mol', 'mole'], ['cd', 'candela']];
for (const [sym, id] of BASE) {
  add('1 Base units and prefixes', sym, `\\${id}`, { cite: 'Table A.1 p. 47; R017 p. 74' });
  for (const [ps, pid] of Object.entries(P)) {
    const u = ps + sym;
    // Element symbols that a prefix would turn into a unit are not converted (Tm, Pm, Ts, Es: thulium, promethium …)
    const element = ['Tm', 'Pm', 'Ts', 'Es'].includes(u);
    const special = { Gs: 'gauss, not gigasecond', pK: 'a p-function (pK), not picokelvin', as: '' }[u];
    if (element) add('1 Base units and prefixes', u, '', { why: `"${u}" is also a chemical element symbol; not read as a prefixed unit`, cite: 'generator rule (no ambiguous reading)' });
    else if (special) add('1 Base units and prefixes', u, '', { why: special, cite: 'generator rule (non-SI symbol)' });
    else add('1 Base units and prefixes', u, `\\${pid}\\${id}`, { cite: 'Table A.5 p. 53; R018 p. 74' });
  }
}
// Mass: kilogram never takes a prefix; other masses are gram with a prefix (R010, R011 p. 72)
add('1 Base units and prefixes', 'kg', '\\kilogram', { cite: 'Table A.1 p. 47; R011 p. 72' });
add('1 Base units and prefixes', 'g', '\\gram', { cite: 'Table A.3 p. 49' });
for (const [ps, pid] of Object.entries(P)) {
  if (ps === 'k') continue;
  const u = ps + 'g';
  if (u === 'Mg') { add('1 Base units and prefixes', u, '', { why: '"Mg" is also magnesium; not read as megagram', cite: 'generator rule (no ambiguous reading)' }); continue; }
  add('1 Base units and prefixes', u, `\\${pid}\\gram`, { cite: 'Table A.5 p. 53; R011 p. 72' });
}

// ── 2. SI derived units with prefixes (Table A.3 pp. 49–51; R018 p. 74)
const DERIVED = [['Hz', 'hertz'], ['N', 'newton'], ['Pa', 'pascal'], ['J', 'joule'], ['W', 'watt'], ['V', 'volt'], ['F', 'farad'], ['Ω', 'ohm'],
  ['S', 'siemens'], ['Wb', 'weber'], ['T', 'tesla'], ['H', 'henry'], ['lm', 'lumen'], ['lx', 'lux'], ['Bq', 'becquerel'], ['Gy', 'gray'], ['Sv', 'sievert'],
  ['kat', 'katal'], ['rad', 'radian'], ['sr', 'steradian']];
const COMMON = ['k', 'M', 'G', 'T', 'm', 'µ', 'n', 'p', 'c', 'h', 'd'];
for (const [sym, id] of DERIVED) {
  add('2 Derived units and prefixes', sym, `\\${id}`, { cite: 'Table A.3 p. 49; R018 p. 74' });
  for (const ps of COMMON) {
    const u = ps + sym;
    const skip = { pH: 'pH is the quantity pH (written \\one), not picohenry', dPa: '', hH: '', cS: '', hT: '', dT: '', cT: '', hHz: '', TT: '', MT: '', GT: '', cHz: '', dHz: '' };
    if (u in skip) { if (skip[u]) add('2 Derived units and prefixes', u, '\\one', { why: skip[u], cite: 'Table A.2 p. 48 (dimension one)' }); continue; }
    const notRead = { TS: 'TS is the German note "Trockensubstanz" (dry matter), not terasiemens', Grad: '"Grad" is the German word for degree, not gigaradian' };
    if (u in notRead) { add('2 Derived units and prefixes', u, '', { why: notRead[u], cite: 'generator rule (non-SI word)' }); continue; }
    add('2 Derived units and prefixes', u, `\\${P[ps]}\\${id}`, { cite: 'Table A.5 p. 53; R018 p. 74' });
  }
}
add('2 Derived units and prefixes', '°C', '\\degreecelsius', { cite: 'Table A.3 p. 50; R010 p. 72 (no prefix)' });
add('2 Derived units and prefixes', '℃', '\\degreecelsius', { cite: 'Table A.3 p. 50' });
add('2 Derived units and prefixes', 'º C', '\\degreecelsius', { cite: 'Table A.3 p. 50' });
add('2 Derived units and prefixes', 'm°C', '', { why: 'no prefix on degree Celsius', cite: 'R010 p. 72' });
add('2 Derived units and prefixes', 'mC', '\\milli\\coulomb', { cite: 'Table A.5 p. 53' });
add('2 Derived units and prefixes', 'µC', '\\micro\\coulomb', { cite: 'Table A.5 p. 53' });
add('2 Derived units and prefixes', 'nC', '\\nano\\coulomb', { cite: 'Table A.5 p. 53' });
add('2 Derived units and prefixes', 'C', '', { why: 'coulomb or degree Celsius: the context must decide', cite: 'Table A.3 pp. 49–50' });
add('2 Derived units and prefixes', 'C', '\\degreecelsius', { ctx: ['Melting temperature'], why: 'context is a temperature', cite: 'Table A.3 p. 50' });
add('2 Derived units and prefixes', 'C', '\\coulomb', { ctx: ['Electric charge'], why: 'context is a charge', cite: 'Table A.3 p. 49' });
add('2 Derived units and prefixes', 'rad', '', { ctx: ['Absorbed dose'], why: '"rad" in a dose is the old unit rad (0.01 Gy), not the radian', cite: 'Table A.3 p. 49' });
add('2 Derived units and prefixes', '°', '', { ctx: ['Temperature of the bath'], why: '"°" in a temperature: angle or °C?', cite: 'Table A.2 p. 48' });

// ── 3. Units accepted with the SI (Table A.2 p. 48, Table A.4 p. 52; R017/R019 p. 74)
const ACCEPTED = [
  ['min', '\\minute'], ['h', '\\hour'], ['d', '\\day'], ['°', '\\degree'], ['′', '\\arcminute'], ['″', '\\arcsecond'],
  ['L', '\\litre'], ['l', '\\litre'], ['mL', '\\milli\\litre'], ['ml', '\\milli\\litre'], ['µL', '\\micro\\litre'], ['µl', '\\micro\\litre'], ['nL', '\\nano\\litre'],
  ['pL', '\\pico\\litre'], ['fL', '\\femto\\litre'], ['dL', '\\deci\\litre'], ['cL', '\\centi\\litre'], ['hL', '\\hecto\\litre'], ['kL', '\\kilo\\litre'], ['ML', '\\mega\\litre'],
  ['t', '\\tonne'], ['ha', '\\hectare'], ['eV', '\\electronvolt'], ['meV', '\\milli\\electronvolt'], ['keV', '\\kilo\\electronvolt'], ['MeV', '\\mega\\electronvolt'],
  ['GeV', '\\giga\\electronvolt'], ['TeV', '\\tera\\electronvolt'], ['Da', '\\dalton'], ['kDa', '\\kilo\\dalton'], ['MDa', '\\mega\\dalton'], ['u', '\\dalton'], ['au', '\\astronomicalunit'],
  ['dB', '\\decibel'], ['Np', '\\neper'],
];
for (const [u, e] of ACCEPTED) add('3 Units accepted with the SI', u, e, { cite: 'Tables A.2/A.4 pp. 48, 52; R017/R019 p. 74' });
for (const u of ['kmin', 'mh', 'kd', 'mdB', 'm°']) add('3 Units accepted with the SI', u, '', { why: 'these units take no prefix', cite: 'R010 p. 72; Section 3 p. 16' });

// ── 4. Bronze units (R020 p. 75): value never converted to pascal or metre
for (const [u, e] of [['bar', '\\bar'], ['mbar', '\\milli\\bar'], ['kbar', '\\kilo\\bar'], ['µbar', '\\micro\\bar'], ['Mbar', '\\mega\\bar'], ['Å', '\\angstrom'], ['Å', '\\angstrom'], ['mmHg', '\\mmhg'], ['mm Hg', '\\mmhg']]) {
  add('4 Bronze units (8th SI brochure)', u, e, { cite: 'R020 p. 75; value not converted' });
}
add('4 Bronze units (8th SI brochure)', 'cmHg', '', { why: 'not the same size as mmHg; no prefix on \\mmhg', cite: 'R010 p. 72' });

// ── 5. Exponents in every spelling (Section 3 p. 15; R013 p. 73)
const EXP = [['m2', '\\metre\\tothe{2}'], ['m²', '\\metre\\tothe{2}'], ['m^2', '\\metre\\tothe{2}'], ['m3', '\\metre\\tothe{3}'], ['m³', '\\metre\\tothe{3}'], ['m^3', '\\metre\\tothe{3}'],
  ['cm2', '\\centi\\metre\\tothe{2}'], ['cm²', '\\centi\\metre\\tothe{2}'], ['cm3', '\\centi\\metre\\tothe{3}'], ['cm³', '\\centi\\metre\\tothe{3}'], ['mm2', '\\milli\\metre\\tothe{2}'],
  ['mm³', '\\milli\\metre\\tothe{3}'], ['dm³', '\\deci\\metre\\tothe{3}'], ['dm3', '\\deci\\metre\\tothe{3}'], ['km²', '\\kilo\\metre\\tothe{2}'], ['µm²', '\\micro\\metre\\tothe{2}'],
  ['m-1', '\\metre\\tothe{-1}'], ['m⁻¹', '\\metre\\tothe{-1}'], ['m^-1', '\\metre\\tothe{-1}'], ['cm-1', '\\centi\\metre\\tothe{-1}'], ['cm⁻¹', '\\centi\\metre\\tothe{-1}'],
  ['cm^-1', '\\centi\\metre\\tothe{-1}'], ['s-1', '\\second\\tothe{-1}'], ['s⁻¹', '\\second\\tothe{-1}'], ['s^-1', '\\second\\tothe{-1}'], ['1/s', '\\second\\tothe{-1}'],
  ['min-1', '\\minute\\tothe{-1}'], ['1/min', '\\minute\\tothe{-1}'], ['h-1', '\\hour\\tothe{-1}'], ['1/h', '\\hour\\tothe{-1}'], ['d-1', '\\day\\tothe{-1}'], ['K-1', '\\kelvin\\tothe{-1}'],
  ['K⁻¹', '\\kelvin\\tothe{-1}'], ['1/K', '\\kelvin\\tothe{-1}'], ['°C⁻¹', '\\degreecelsius\\tothe{-1}'], ['m-2', '\\metre\\tothe{-2}'], ['m-3', '\\metre\\tothe{-3}'], ['s-2', '\\second\\tothe{-2}'],
  ['kg-1', '\\kilogram\\tothe{-1}'], ['mol-1', '\\mole\\tothe{-1}'], ['L-1', '\\litre\\tothe{-1}'], ['m^0.5', '\\metre\\tothe{0.5}'], ['m^-0.5', '\\metre\\tothe{-0.5}'],
  ['Hz^0.5', '\\hertz\\tothe{0.5}'], ['Hz^-0.5', '\\hertz\\tothe{-0.5}'], ['K-4', '\\kelvin\\tothe{-4}'], ['m^4', '\\metre\\tothe{4}']];
for (const [u, e] of EXP) add('5 Exponents', u, e, { cite: 'Section 3 p. 15; R013 p. 73' });
add('5 Exponents', 'm^1.5', '', { why: 'exponent 1.5 is not allowed (integers or ±0.5 only)', cite: 'R013 p. 73' });
add('5 Exponents', 'ms-1', '\\milli\\second\\tothe{-1}', { why: 'allowed by R010 (only rotation forbidden); the guide recommends against it (warning)', cite: 'Section 3 p. 16; R010 p. 72' });

// ── 6. Compound units (Section 3 pp. 15–17; R015 p. 73)
const COMPOUND = [
  ['m/s', '\\metre\\second\\tothe{-1}'], ['m s-1', '\\metre\\second\\tothe{-1}'], ['m·s⁻¹', '\\metre\\second\\tothe{-1}'], ['km/h', '\\kilo\\metre\\hour\\tothe{-1}'],
  ['m/s²', '\\metre\\second\\tothe{-2}'], ['m s-2', '\\metre\\second\\tothe{-2}'], ['N·m', '\\newton\\metre'], ['N m', '\\newton\\metre'], ['Nm', '\\newton\\metre'], ['kN·m', '\\kilo\\newton\\metre'],
  ['N/m', '\\newton\\metre\\tothe{-1}'], ['mN/m', '\\milli\\newton\\metre\\tothe{-1}'], ['N/m²', '\\newton\\metre\\tothe{-2}'], ['N/mm²', '\\newton\\milli\\metre\\tothe{-2}'],
  ['Pa·s', '\\pascal\\second'], ['Pa s', '\\pascal\\second'], ['mPa·s', '\\milli\\pascal\\second'], ['mPa s', '\\milli\\pascal\\second'], ['mPas', '\\milli\\pascal\\second'],
  ['Pas', '\\pascal\\second'], ['m²/s', '\\metre\\tothe{2}\\second\\tothe{-1}'], ['mm²/s', '\\milli\\metre\\tothe{2}\\second\\tothe{-1}'], ['W/m²', '\\watt\\metre\\tothe{-2}'],
  ['W/m2', '\\watt\\metre\\tothe{-2}'], ['W m-2', '\\watt\\metre\\tothe{-2}'], ['W/m', '\\watt\\metre\\tothe{-1}'], ['W/(m·K)', '\\watt\\metre\\tothe{-1}\\kelvin\\tothe{-1}'],
  ['W/(m K)', '\\watt\\metre\\tothe{-1}\\kelvin\\tothe{-1}'], ['W m-1 K-1', '\\watt\\metre\\tothe{-1}\\kelvin\\tothe{-1}'], ['W/(m²·K)', '\\watt\\metre\\tothe{-2}\\kelvin\\tothe{-1}'],
  ['W m-2 K-4', '\\watt\\metre\\tothe{-2}\\kelvin\\tothe{-4}'], ['J/(kg·K)', '\\joule\\kilogram\\tothe{-1}\\kelvin\\tothe{-1}'], ['J/(kg K)', '\\joule\\kilogram\\tothe{-1}\\kelvin\\tothe{-1}'],
  ['J kg-1 K-1', '\\joule\\kilogram\\tothe{-1}\\kelvin\\tothe{-1}'], ['J/(g·K)', '\\joule\\gram\\tothe{-1}\\kelvin\\tothe{-1}'], ['J/(mol·K)', '\\joule\\mole\\tothe{-1}\\kelvin\\tothe{-1}'],
  ['J/(mol K)', '\\joule\\mole\\tothe{-1}\\kelvin\\tothe{-1}'], ['kJ/mol', '\\kilo\\joule\\mole\\tothe{-1}'], ['kJ/kg', '\\kilo\\joule\\kilogram\\tothe{-1}'], ['MJ/kg', '\\mega\\joule\\kilogram\\tothe{-1}'],
  ['J/g', '\\joule\\gram\\tothe{-1}'], ['J/m³', '\\joule\\metre\\tothe{-3}'], ['kWh', '\\kilo\\watt\\hour'], ['W·h', '\\watt\\hour'], ['Wh', '\\watt\\hour'], ['mAh', '\\milli\\ampere\\hour'],
  ['A·h', '\\ampere\\hour'], ['Ah', '\\ampere\\hour'], ['A s', '\\ampere\\second'], ['V/m', '\\volt\\metre\\tothe{-1}'], ['kV/mm', '\\kilo\\volt\\milli\\metre\\tothe{-1}'],
  ['V/V', '\\volt\\volt\\tothe{-1}'], ['mV/V', '\\milli\\volt\\volt\\tothe{-1}'], ['µV/V', '\\micro\\volt\\volt\\tothe{-1}'], ['µV/K', '\\micro\\volt\\kelvin\\tothe{-1}'],
  ['V/(m·s)', '\\volt\\metre\\tothe{-1}\\second\\tothe{-1}'], ['VA', '\\volt\\ampere'], ['V A', '\\volt\\ampere'], ['A/m', '\\ampere\\metre\\tothe{-1}'], ['A/m²', '\\ampere\\metre\\tothe{-2}'],
  ['C/kg', '\\coulomb\\kilogram\\tothe{-1}'], ['C/mol', '\\coulomb\\mole\\tothe{-1}'], ['C m', '\\coulomb\\metre'], ['A m²', '\\ampere\\metre\\tothe{2}'], ['Ω·m', '\\ohm\\metre'], ['Ω m', '\\ohm\\metre'],
  ['Ω·cm', '\\ohm\\centi\\metre'], ['µΩ·cm', ''], ['S/m', '\\siemens\\metre\\tothe{-1}'], ['mS/cm', '\\milli\\siemens\\centi\\metre\\tothe{-1}'],
  ['µS/cm', '\\micro\\siemens\\centi\\metre\\tothe{-1}'], ['uS/cm', '\\micro\\siemens\\centi\\metre\\tothe{-1}'], ['S·m²/mol', '\\siemens\\metre\\tothe{2}\\mole\\tothe{-1}'],
  ['F/m', '\\farad\\metre\\tothe{-1}'], ['H/m', '\\henry\\metre\\tothe{-1}'], ['T·m', '\\tesla\\metre'], ['Wb/m²', '\\weber\\metre\\tothe{-2}'],
  ['cd/m²', '\\candela\\metre\\tothe{-2}'], ['cd/m2', '\\candela\\metre\\tothe{-2}'], ['lm/W', '\\lumen\\watt\\tothe{-1}'], ['lx·s', '\\lux\\second'], ['lm·s', '\\lumen\\second'],
  ['W/sr', '\\watt\\steradian\\tothe{-1}'], ['W/(m²·sr)', '\\watt\\metre\\tothe{-2}\\steradian\\tothe{-1}'], ['W/m2/sr', '\\watt\\metre\\tothe{-2}\\steradian\\tothe{-1}'],
  ['Bq/kg', '\\becquerel\\kilogram\\tothe{-1}'], ['Bq/g', '\\becquerel\\gram\\tothe{-1}'], ['Bq/L', '\\becquerel\\litre\\tothe{-1}'], ['Bq/m³', '\\becquerel\\metre\\tothe{-3}'],
  ['Bq·kg⁻¹', '\\becquerel\\kilogram\\tothe{-1}'], ['kBq/kg', '\\kilo\\becquerel\\kilogram\\tothe{-1}'], ['mBq/L', '\\milli\\becquerel\\litre\\tothe{-1}'], ['MBq/mL', '\\mega\\becquerel\\milli\\litre\\tothe{-1}'],
  ['Bq/(g·s)', '\\becquerel\\gram\\tothe{-1}\\second\\tothe{-1}'], ['Gy/s', '\\gray\\second\\tothe{-1}'], ['mGy/h', '\\milli\\gray\\hour\\tothe{-1}'], ['µSv/h', '\\micro\\sievert\\hour\\tothe{-1}'],
  ['nSv/h', '\\nano\\sievert\\hour\\tothe{-1}'], ['Sv/Bq', '\\sievert\\becquerel\\tothe{-1}'], ['kat/L', '\\katal\\litre\\tothe{-1}'], ['µkat/L', '\\micro\\katal\\litre\\tothe{-1}'],
  ['kat/kg', '\\katal\\kilogram\\tothe{-1}'], ['mol/(L·s)', '\\mole\\litre\\tothe{-1}\\second\\tothe{-1}'], ['mol/(m²·s)', '\\mole\\metre\\tothe{-2}\\second\\tothe{-1}'],
  ['µmol/(m²·s)', '\\micro\\mole\\metre\\tothe{-2}\\second\\tothe{-1}'], ['kg/(m·s)', '\\kilogram\\metre\\tothe{-1}\\second\\tothe{-1}'], ['kg·m/s', '\\kilogram\\metre\\second\\tothe{-1}'],
  ['kg m s-2', '\\kilogram\\metre\\second\\tothe{-2}'], ['kg·m²', '\\kilogram\\metre\\tothe{2}'], ['kg/s', '\\kilogram\\second\\tothe{-1}'], ['g/s', '\\gram\\second\\tothe{-1}'],
  ['L/min', '\\litre\\minute\\tothe{-1}'], ['mL/min', '\\milli\\litre\\minute\\tothe{-1}'], ['L/h', '\\litre\\hour\\tothe{-1}'], ['m³/h', '\\metre\\tothe{3}\\hour\\tothe{-1}'],
  ['m3/h', '\\metre\\tothe{3}\\hour\\tothe{-1}'], ['m³/s', '\\metre\\tothe{3}\\second\\tothe{-1}'], ['Pa·m³/s', '\\pascal\\metre\\tothe{3}\\second\\tothe{-1}'], ['Pa m3/s', '\\pascal\\metre\\tothe{3}\\second\\tothe{-1}'],
  ['mbar·L/s', '\\milli\\bar\\litre\\second\\tothe{-1}'], ['mbar L/s', '\\milli\\bar\\litre\\second\\tothe{-1}'], ['g/(cm²·s)', '\\gram\\centi\\metre\\tothe{-2}\\second\\tothe{-1}'],
  ['°C/min', '\\degreecelsius\\minute\\tothe{-1}'], ['K/min', '\\kelvin\\minute\\tothe{-1}'], ['K/W', '\\kelvin\\watt\\tothe{-1}'], ['m²·K/W', '\\metre\\tothe{2}\\kelvin\\watt\\tothe{-1}'],
  ['°/s', '\\degree\\second\\tothe{-1}'], ['rad/s', '\\radian\\second\\tothe{-1}'], ['rad/s²', '\\radian\\second\\tothe{-2}'], ['m/m', '\\metre\\metre\\tothe{-1}'],
  ['mm/m', '\\milli\\metre\\metre\\tothe{-1}'], ['µm/m', '\\micro\\metre\\metre\\tothe{-1}'], ['µm/(m·K)', '\\micro\\metre\\metre\\tothe{-1}\\kelvin\\tothe{-1}'], ['nm/m', '\\nano\\metre\\metre\\tothe{-1}'],
  ['m²/g', '\\metre\\tothe{2}\\gram\\tothe{-1}'], ['m2/g', '\\metre\\tothe{2}\\gram\\tothe{-1}'], ['m²/kg', '\\metre\\tothe{2}\\kilogram\\tothe{-1}'], ['cm³/g', '\\centi\\metre\\tothe{3}\\gram\\tothe{-1}'],
  ['mL/g', '\\milli\\litre\\gram\\tothe{-1}'], ['L/mol', '\\litre\\mole\\tothe{-1}'], ['cm³/mol', '\\centi\\metre\\tothe{3}\\mole\\tothe{-1}'], ['m³/kg', '\\metre\\tothe{3}\\kilogram\\tothe{-1}'],
  ['kg/m³', '\\kilogram\\metre\\tothe{-3}'], ['kg/m3', '\\kilogram\\metre\\tothe{-3}'], ['kg m-3', '\\kilogram\\metre\\tothe{-3}'], ['kg·m⁻³', '\\kilogram\\metre\\tothe{-3}'],
  ['g/cm³', '\\gram\\centi\\metre\\tothe{-3}'], ['g/cm3', '\\gram\\centi\\metre\\tothe{-3}'], ['g·cm⁻³', '\\gram\\centi\\metre\\tothe{-3}'], ['g/mL', '\\gram\\milli\\litre\\tothe{-1}'],
  ['kg/L', '\\kilogram\\litre\\tothe{-1}'], ['kg/dm³', '\\kilogram\\deci\\metre\\tothe{-3}'], ['g/dm³', '\\gram\\deci\\metre\\tothe{-3}'], ['kg/ha', '\\kilogram\\hectare\\tothe{-1}'],
  ['t/ha', '\\tonne\\hectare\\tothe{-1}'], ['g/m²', '\\gram\\metre\\tothe{-2}'], ['mg/cm²', '\\milli\\gram\\centi\\metre\\tothe{-2}'], ['µg/cm2', '\\micro\\gram\\centi\\metre\\tothe{-2}'],
  ['MPa·m^0.5', '\\mega\\pascal\\metre\\tothe{0.5}'], ['V/Hz^0.5', '\\volt\\hertz\\tothe{-0.5}'], ['MPa mm', '\\kilo\\pascal\\metre'], ['mg/(kg·d)', '\\milli\\gram\\kilogram\\tothe{-1}\\day\\tothe{-1}'],
  ['µg/kg/d', '\\micro\\gram\\kilogram\\tothe{-1}\\day\\tothe{-1}'], ['mg/L/h', '\\milli\\gram\\litre\\tothe{-1}\\hour\\tothe{-1}'], ['m/s/s', '\\metre\\second\\tothe{-2}'],
  ['mol kg-1', '\\mole\\kilogram\\tothe{-1}'], ['mol·kg⁻¹', '\\mole\\kilogram\\tothe{-1}'], ['μmol·kg⁻¹', '\\micro\\mole\\kilogram\\tothe{-1}'], ['nmol g-1', '\\nano\\mole\\gram\\tothe{-1}'],
];
for (const [u, e] of COMPOUND) add('6 Compound units', u, e, { cite: 'Section 3 pp. 15–17; R015 p. 73' });
add('6 Compound units', 'µg/mg/kg', '', { why: 'two prefixes in the denominator cannot be merged into one without changing the value? (µg per mg per kg = ng/kg²·10^?)', cite: 'R015 p. 73', soft: true });

// ── 7. Concentrations and fractions (Section 3; Tables A.3–A.5; D-SI 2.2.1 \percent, \ppm)
const CONC = [
  ['mg/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg/kg', '\\micro\\gram\\kilogram\\tothe{-1}'], ['ug/kg', '\\micro\\gram\\kilogram\\tothe{-1}'], ['μg/kg', '\\micro\\gram\\kilogram\\tothe{-1}'],
  ['ng/kg', '\\nano\\gram\\kilogram\\tothe{-1}'], ['ng/g', '\\nano\\gram\\gram\\tothe{-1}'], ['pg/g', '\\pico\\gram\\gram\\tothe{-1}'], ['µg/g', '\\micro\\gram\\gram\\tothe{-1}'],
  ['mg/g', '\\milli\\gram\\gram\\tothe{-1}'], ['g/g', '\\gram\\gram\\tothe{-1}'], ['g/kg', '\\gram\\kilogram\\tothe{-1}'], ['kg/kg', '\\kilogram\\kilogram\\tothe{-1}'],
  ['g/100 g', '\\gram\\hecto\\gram\\tothe{-1}'], ['g/100g', '\\gram\\hecto\\gram\\tothe{-1}'], ['mg/100 g', '\\milli\\gram\\hecto\\gram\\tothe{-1}'], ['g per 100 g', '\\gram\\hecto\\gram\\tothe{-1}'],
  ['µg/mg', '\\micro\\gram\\milli\\gram\\tothe{-1}'], ['mg/t', '\\milli\\gram\\tonne\\tothe{-1}'], ['mg kg-1', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg·kg⁻¹', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg kg^-1', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mgkg-1', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg g-1', '\\micro\\gram\\gram\\tothe{-1}'], ['mg / kg', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg per kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['[mg/kg]', '\\milli\\gram\\kilogram\\tothe{-1}'], ['(mg/kg)', '\\milli\\gram\\kilogram\\tothe{-1}'], ['in mg/kg', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg/(kg)', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg/L', '\\milli\\gram\\litre\\tothe{-1}'], ['µg/L', '\\micro\\gram\\litre\\tothe{-1}'], ['ng/L', '\\nano\\gram\\litre\\tothe{-1}'],
  ['ng/mL', '\\nano\\gram\\milli\\litre\\tothe{-1}'], ['pg/mL', '\\pico\\gram\\milli\\litre\\tothe{-1}'], ['µg/mL', '\\micro\\gram\\milli\\litre\\tothe{-1}'], ['mg/mL', '\\milli\\gram\\milli\\litre\\tothe{-1}'],
  ['ng/µL', '\\nano\\gram\\micro\\litre\\tothe{-1}'], ['g/L', '\\gram\\litre\\tothe{-1}'], ['mg/dL', '\\milli\\gram\\deci\\litre\\tothe{-1}'], ['g/dL', '\\gram\\deci\\litre\\tothe{-1}'],
  ['g/100 mL', '\\gram\\deci\\litre\\tothe{-1}'], ['mg/100 mL', '\\milli\\gram\\deci\\litre\\tothe{-1}'], ['mg/m³', '\\milli\\gram\\metre\\tothe{-3}'], ['µg/m³', '\\micro\\gram\\metre\\tothe{-3}'],
  ['mg/m3', '\\milli\\gram\\metre\\tothe{-3}'], ['mol/mol', '\\mole\\mole\\tothe{-1}'], ['mmol/mol', '\\milli\\mole\\mole\\tothe{-1}'], ['µmol/mol', '\\micro\\mole\\mole\\tothe{-1}'],
  ['nmol/mol', '\\nano\\mole\\mole\\tothe{-1}'], ['pmol/mol', '\\pico\\mole\\mole\\tothe{-1}'], ['mol/kg', '\\mole\\kilogram\\tothe{-1}'], ['mmol/kg', '\\milli\\mole\\kilogram\\tothe{-1}'],
  ['µmol/g', '\\micro\\mole\\gram\\tothe{-1}'], ['nmol/g', '\\nano\\mole\\gram\\tothe{-1}'], ['mol/L', '\\mole\\litre\\tothe{-1}'], ['mmol/L', '\\milli\\mole\\litre\\tothe{-1}'],
  ['µmol/L', '\\micro\\mole\\litre\\tothe{-1}'], ['nmol/L', '\\nano\\mole\\litre\\tothe{-1}'], ['fmol/µL', '\\femto\\mole\\micro\\litre\\tothe{-1}'], ['mol/m³', '\\mole\\metre\\tothe{-3}'],
  ['mol/m3', '\\mole\\metre\\tothe{-3}'], ['kmol/m³', '\\kilo\\mole\\metre\\tothe{-3}'], ['mol/dm³', '\\mole\\deci\\metre\\tothe{-3}'], ['mol/dm3', '\\mole\\deci\\metre\\tothe{-3}'],
  ['M', '\\mole\\litre\\tothe{-1}'], ['mM', '\\milli\\mole\\litre\\tothe{-1}'], ['µM', '\\micro\\mole\\litre\\tothe{-1}'], ['nM', '\\nano\\mole\\litre\\tothe{-1}'], ['pM', '\\pico\\mole\\litre\\tothe{-1}'],
  ['aM', '\\atto\\mole\\litre\\tothe{-1}'], ['g/mol', '\\gram\\mole\\tothe{-1}'], ['kg/mol', '\\kilogram\\mole\\tothe{-1}'], ['L/mol', '\\litre\\mole\\tothe{-1}'],
  ['%', '\\percent'], [' %', '\\percent'], ['in %', '\\percent'], ['% (m/m)', '\\percent'], ['%(m/m)', '\\percent'], ['% m/m', '\\percent'], ['%m/m', '\\percent'], ['% (w/w)', '\\percent'],
  ['% w/w', '\\percent'], ['% (g/g)', '\\percent'], ['mass %', '\\percent'], ['mass-%', '\\percent'], ['wt%', '\\percent'], ['wt.%', '\\percent'], ['wt. %', '\\percent'], ['Gew.-%', '\\percent'],
  ['% by mass', '\\percent'], ['% by weight', '\\percent'], ['% (v/v)', '\\percent'], ['% (V/V)', '\\percent'], ['% v/v', '\\percent'], ['%V/V', '\\percent'], ['vol%', '\\percent'],
  ['vol.%', '\\percent'], ['Vol.-%', '\\percent'], ['% by volume', '\\percent'], ['% (mol/mol)', '\\percent'], ['%(mol/mol)', '\\percent'], ['mol%', '\\percent'], ['mol %', '\\percent'],
  ['at.%', '\\percent'], ['at%', '\\percent'], ['%RH', '\\percent'], ['% RH', '\\percent'], ['%IACS', '\\percent'], ['% IACS', '\\percent'], ['%/K', '\\percent\\kelvin\\tothe{-1}'],
  ['%/a', ''],
  ['ppm', '\\ppm'], ['ppm (mol/mol)', '\\ppm'], ['ppm (m/m)', '\\ppm'], ['ppm v/v', '\\ppm'], ['ppmv', '\\ppm'], ['ppmw', '\\ppm'], ['ppm/K', '\\ppm\\kelvin\\tothe{-1}'],
  ['ppm/°C', '\\ppm\\degreecelsius\\tothe{-1}'], ['% (w/v)', '\\gram\\deci\\litre\\tothe{-1}'], ['% w/v', '\\gram\\deci\\litre\\tothe{-1}'], ['% (m/v)', '\\gram\\deci\\litre\\tothe{-1}'],
  ['%(w/v)', '\\gram\\deci\\litre\\tothe{-1}'], ['‰ (w/v)', '\\gram\\litre\\tothe{-1}'], ['ppm (w/v)', '\\milli\\gram\\litre\\tothe{-1}'], ['ppb (w/v)', '\\micro\\gram\\litre\\tothe{-1}'],
  ['g/100 mL (w/v)', '\\gram\\deci\\litre\\tothe{-1}'], ['mg/L (w/v)', '\\milli\\gram\\litre\\tothe{-1}'],
];
for (const [u, e] of CONC) add('7 Concentrations and fractions', u, e, { cite: u.includes('w/v') || u.includes('m/v') ? 'Ph. Eur. 1.2 (w/v = g per 100 mL); Table A.4 p. 52' : /%|ppm/.test(u) ? 'D-SI 2.2.1 unit list (\\percent, \\ppm); Section 3' : 'Section 3 pp. 15–17; R015 p. 73' });
// ppb, ‰: no identifier; only with the stated kind of fraction
const KIND = [
  ['ppb', '', null], ['ppb', '\\micro\\gram\\kilogram\\tothe{-1}', 'Mass fraction of lead'], ['ppb', '\\nano\\mole\\mole\\tothe{-1}', 'Amount fraction of CO2 in nitrogen'],
  ['ppb', '\\nano\\litre\\litre\\tothe{-1}', 'Volume fraction'], ['ppb (m/m)', '\\micro\\gram\\kilogram\\tothe{-1}', null], ['ppb w/w', '\\micro\\gram\\kilogram\\tothe{-1}', null],
  ['ppb (mol/mol)', '\\nano\\mole\\mole\\tothe{-1}', null], ['ppbv', '\\nano\\litre\\litre\\tothe{-1}', null], ['ppbw', '\\micro\\gram\\kilogram\\tothe{-1}', null],
  ['‰', '', null], ['‰', '\\gram\\kilogram\\tothe{-1}', 'mass fraction'], ['‰', '\\milli\\mole\\mole\\tothe{-1}', 'amount fraction'], ['‰', '\\milli\\litre\\litre\\tothe{-1}', 'volume fraction'],
  ['‰ (m/m)', '\\gram\\kilogram\\tothe{-1}', null], ['‰', '', 'δ13C value vs VPDB'], ['ppb', '', 'Concentration of lead'],
];
for (const [u, e, c] of KIND) add('8 ppb and ‰ (kind of fraction from the text)', u, e, { ...(c ? { ctx: [c] } : {}), why: e ? 'kind stated' : 'kind not stated: not converted', cite: 'Section 3; Table A.5 p. 53 (generator rule: only with the stated kind)' });

// ── 9. Powers of ten written with the unit (absorbed into a prefix; the number stays as printed)
const POW = [['× 10³ g/mol', '\\kilogram\\mole\\tothe{-1}'], ['x 10^3 g/mol', '\\kilogram\\mole\\tothe{-1}'], ['10^3 g/mol', '\\kilogram\\mole\\tothe{-1}'], ['×10^-3 m', '\\milli\\metre'],
  ['10^-3 g', '\\milli\\gram'], ['10⁶ Bq', '\\mega\\becquerel'], ['× 10⁻⁶ m', '\\micro\\metre'], ['x10^6 Pa', '\\mega\\pascal'], ['10^-9 m', '\\nano\\metre'], ['× 10³ kg', '\\mega\\gram'],
  ['10^3 L', '\\kilo\\litre'], ['× 10⁻⁶ K⁻¹', ''], ['10⁻⁶/K', ''], ['× 10⁻³', ''], ['10^3', ''], ['x 10^4 m', '']];
for (const [u, e] of POW) add('9 Powers of ten with the unit', u, e, { why: e ? 'the power of ten becomes a prefix; the value is not multiplied' : 'no unit or no single prefix of that size: not converted', cite: 'Section 8 p. 40 (prefixes carry the exponential notation); Table A.5 p. 53' });

// ── 10. CGS units that are exactly a D-SI expression (value unchanged)
for (const [u, e] of [['cP', '\\milli\\pascal\\second'], ['P', '\\deci\\pascal\\second'], ['mP', ''], ['cSt', '\\milli\\metre\\tothe{2}\\second\\tothe{-1}'], ['St', '\\centi\\metre\\tothe{2}\\second\\tothe{-1}'], ['dyn', ''], ['erg', '']]) {
  add('10 CGS units', u, e, { why: e ? 'exactly a D-SI expression of the same size' : 'no D-SI identifier and no equal-size expression', cite: 'SI brochure 8th ed. Table 9; R020 p. 75' });
}

// ── 11. Notes in the unit text (basis, analyte, "as N"): not part of a unit, kept out of the D-SI unit
const NOTES = [
  ['mg/kg dry mass', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg/kg dry matter', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg/kg (dry weight)', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg/kg, dry basis', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg/kg on dry basis', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg/kg (as received)', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg/kg as received', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg/kg fresh weight', '\\micro\\gram\\kilogram\\tothe{-1}'], ['mg/kg dm', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg/kg DM', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg/kg TS', '\\milli\\gram\\kilogram\\tothe{-1}'], ['g/kg dw', '\\gram\\kilogram\\tothe{-1}'], ['µg/kg ww', '\\micro\\gram\\kilogram\\tothe{-1}'],
  ['mg/kg bw', '\\milli\\gram\\kilogram\\tothe{-1}'], ['Bq/kg dry mass', '\\becquerel\\kilogram\\tothe{-1}'], ['Bq kg-1 dw', '\\becquerel\\kilogram\\tothe{-1}'], ['mg/kg soil', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['g/100 g fat', '\\gram\\hecto\\gram\\tothe{-1}'], ['mol/kg water', '\\mole\\kilogram\\tothe{-1}'], ['mg/kg in dry matter', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg/L as N', '\\milli\\gram\\litre\\tothe{-1}'], ['µg/L as N', '\\micro\\gram\\litre\\tothe{-1}'], ['mg/L as P', '\\milli\\gram\\litre\\tothe{-1}'], ['mg/L as CaCO3', '\\milli\\gram\\litre\\tothe{-1}'],
  ['mg/kg (as N)', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg/L CaCO3', '\\milli\\gram\\litre\\tothe{-1}'], ['mg Hg/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg Hg/kg', '\\micro\\gram\\kilogram\\tothe{-1}'],
  ['ng Hg/g', '\\nano\\gram\\gram\\tothe{-1}'], ['mg Cd/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg As/kg', '\\micro\\gram\\kilogram\\tothe{-1}'], ['mg Cu/kg', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg Pb/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg Zn/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg U/g', '\\micro\\gram\\gram\\tothe{-1}'], ['µg Th/g', '\\micro\\gram\\gram\\tothe{-1}'],
  ['mg Mg/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg K/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg N/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['g N/kg', '\\gram\\kilogram\\tothe{-1}'],
  ['kg N/ha', '\\kilogram\\hectare\\tothe{-1}'], ['mg C/g', '\\milli\\gram\\gram\\tothe{-1}'], ['g C/kg', '\\gram\\kilogram\\tothe{-1}'], ['mg S/kg', '\\milli\\gram\\kilogram\\tothe{-1}'],
  ['mg P/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg V/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['mg W/kg', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg F/L', '\\micro\\gram\\litre\\tothe{-1}'],
  ['% N', '\\percent'], ['% C', '\\percent'], ['mg KOH/g', '\\milli\\gram\\gram\\tothe{-1}'], ['mmol H+/kg', '\\milli\\mole\\kilogram\\tothe{-1}'], ['mg NO3-N/L', '\\milli\\gram\\litre\\tothe{-1}'],
  ['mg NH4-N/L', '\\milli\\gram\\litre\\tothe{-1}'], ['mg O2/L', '\\milli\\gram\\litre\\tothe{-1}'], ['mg/kg Pb', '\\milli\\gram\\kilogram\\tothe{-1}'], ['µg/kg Hg', '\\micro\\gram\\kilogram\\tothe{-1}'],
  ['mg Hg kg-1', '\\milli\\gram\\kilogram\\tothe{-1}'], ['Bq Cs-137/kg', '\\becquerel\\kilogram\\tothe{-1}'], ['Bq/kg Cs-137', '\\becquerel\\kilogram\\tothe{-1}'], ['Bq/kg K-40', '\\becquerel\\kilogram\\tothe{-1}'],
  ['Bq/kg ¹³⁷Cs', '\\becquerel\\kilogram\\tothe{-1}'], ['Bq/L H-3', '\\becquerel\\litre\\tothe{-1}'], ['mg/kg N', '', ], ['mg/kg N', '\\milli\\gram\\kilogram\\tothe{-1}', 'ai'],
  ['kg/(m³ K)', ''], ['mol/(kg K)', ''], ['mg/kg Mg', ''],
];
for (const [u, e, how] of NOTES) {
  if (how === 'ai') continue; // covered by the AI scenarios
  add('11 Notes in the unit (basis, analyte, "as N")', u, e, {
    why: e ? 'the note is kept out of the D-SI unit (warning: state it in the quantity name)' : 'element after the unit in the denominator: element or unit symbol? not converted by the rules (the AI decides with the context)',
    cite: 'Section 3 pp. 12–17 (a D-SI unit holds only unit, prefix and exponent identifiers)',
  });
}

// ── 12. Quantities of dimension one (Table A.2 p. 48)
for (const [u, e] of [['1', '\\one'], ['one', '\\one'], ['dimensionless', '\\one'], ['unitless', '\\one'], ['pH', '\\one'], ['pH units', '\\one'], ['pH unit', '\\one'], ['-', ''], ['n/a', '']]) {
  add('12 Dimension one', u, e, { why: u.startsWith('pH') ? 'pH is a quantity of dimension one; its D-SI unit is \\one (keep "pH" in the quantity name)' : e ? 'dimension one' : 'not a unit', cite: 'Table A.2 p. 48; R014 p. 73' });
}

// ── 13. Not units of the SI, or not readable in one way: never converted (value never changed)
const NOT = [
  ['HV', 'hardness scale'], ['HV10', 'hardness scale'], ['HV 10', 'hardness scale'], ['HV0.1', 'hardness scale'], ['HK', 'hardness scale'], ['HB', 'hardness scale'], ['HBW', 'hardness scale'],
  ['HBW 2.5/187.5', 'hardness scale'], ['HRC', 'hardness scale'], ['HRB', 'hardness scale'], ['HRA', 'hardness scale'], ['HR15N', 'hardness scale'], ['HL', 'hardness scale'], ['Shore A', 'hardness scale'],
  ['dBm', 'level relative to 1 mW'], ['dBA', 'A-weighted level'], ['dB(A)', 'A-weighted level'], ['dB A', 'A-weighted level'], ['dBi', 'level'], ['dBc', 'level'], ['dBµV', 'level'], ['dBW', 'level'],
  ['pKa', 'p-function'], ['pOH', 'p-function'], ['U', 'enzyme unit'], ['U/L', 'enzyme unit'], ['U/mL', 'enzyme unit'], ['IU', 'international unit'], ['IU/mL', 'international unit'], ['mIU/L', 'international unit'],
  ['EU/mL', 'endotoxin unit'], ['AU', 'arbitrary/absorbance unit'], ['mAU', 'absorbance unit'], ['OD', 'optical density'], ['Abs', 'absorbance'], ['RLU', 'relative light unit'], ['NTU', 'turbidity'],
  ['FNU', 'turbidity'], ['Hazen', 'colour scale'], ['Pt-Co', 'colour scale'], ['EBC', 'colour scale'], ['cfu/g', 'colony-forming unit'], ['CFU/mL', 'colony-forming unit'], ['PFU/mL', 'plaque-forming unit'],
  ['MPN/100 mL', 'most probable number'], ['copies/µL', 'count'], ['cells/mL', 'count'], ['particles/mL', 'count'], ['dpm', 'count rate'], ['dpm/g', 'count rate'], ['cpm', 'count rate'],
  ['cps', 'count rate'], ['counts/s', 'count rate'], ['mEq/L', 'equivalent'], ['meq/100 g', 'equivalent'], ['mOsm/kg', 'osmole'], ['mval/L', 'equivalent'],
  ['lb', 'pound'], ['lbs', 'pound'], ['oz', 'ounce'], ['gr', 'grain'], ['ct', 'carat'], ['ft', 'foot'], ['in', 'inch'], ['inch', 'inch'], ['yd', 'yard'], ['mi', 'mile'], ['mil', 'mil'],
  ['gal', 'gallon'], ['gpm', 'gallons per minute'], ['mpg', 'miles per gallon'], ['mph', 'miles per hour'], ['psi', 'pound per square inch'], ['psig', 'gauge psi'], ['atm', 'atmosphere'],
  ['Torr', 'torr (not exactly mmHg)'], ['mTorr', 'torr'], ['inHg', 'inch of mercury'], ['mmH2O', 'water column'], ['kgf', 'kilogram-force'], ['kp', 'kilopond'], ['kgf/cm²', 'kilogram-force'],
  ['lbf', 'pound-force'], ['BTU', 'British thermal unit'], ['cal', 'calorie'], ['kcal', 'kilocalorie'], ['kcal/mol', 'kilocalorie'], ['hp', 'horsepower'], ['PS', 'metric horsepower'],
  ['°F', 'degree Fahrenheit'], ['°R', 'degree Rankine'], ['°Bx', 'degree Brix'], ['°Oe', 'degree Oechsle'], ['°dH', 'German hardness degree'], ['G', 'gauss'], ['Gs', 'gauss'], ['Oe', 'oersted'],
  ['Mx', 'maxwell'], ['Gal', 'gal (acceleration)'], ['Ci', 'curie'], ['mCi', 'curie'], ['R', 'röntgen'], ['rem', 'rem'], ['Nm³/h', 'normal cubic metre'], ['Nm3', 'normal cubic metre'],
  ['NL/min', 'normal litre'], ['sccm', 'standard cm³/min'], ['slm', 'standard L/min'], ['cc', 'cubic centimetre abbreviation'], ['CC', 'cubic centimetre abbreviation'], ['ppt', 'per thousand or per trillion?'],
  ['ppth', 'per thousand'], ['pph', 'per hundred'], ['year', 'year'], ['a', 'annum'], ['Bq/a', 'per annum'], ['month', 'month'], ['week', 'week'], ['lg', 'logarithm'], ['log', 'logarithm'],
  ['Kd', 'distribution coefficient symbol'], ['B', 'bel / byte / boron'], ['Hg', 'element symbol'], ['Cd', 'element symbol'], ['As', 'element symbol (ampere second is written A s)'],
  ['Mt', 'element symbol'], ['Mg', 'element symbol'], ['Tl', 'element symbol'], ['K-40', 'nuclide'], ['C-14', 'nuclide'], ['H-3', 'nuclide'], ['137Cs', 'nuclide'], ['dry mass', 'no unit'],
  ['mm²/s (cSt)', ''], ['mg/kg (on dry basis, ×10⁻³)', 'a power of ten inside a comment'], ['% (v/m)', 'unclear kind of fraction'], ['% (m/m) (v/v)', 'two different kinds of fraction'],
];
for (const [u, why] of NOT) {
  if (u === 'mm²/s (cSt)') { add('13 Not units of the SI / not readable in one way', u, '\\milli\\metre\\tothe{2}\\second\\tothe{-1}', { why: 'the bracket repeats the unit in CGS: it is a comment', cite: 'Section 3' }); continue; }
  add('13 Not units of the SI / not readable in one way', u, '', { why, cite: 'Section 8 p. 41 (improvable); Section 7 pp. 31–38 (si:hybrid for non-SI units)' });
}

// ── 14. Units written in capitals
for (const [u, e] of [['MG/KG', '\\milli\\gram\\kilogram\\tothe{-1}'], ['MG/L', '\\milli\\gram\\litre\\tothe{-1}'], ['UG/KG', '\\micro\\gram\\kilogram\\tothe{-1}'], ['PPM', '\\ppm'],
  ['MOL/KG', '\\mole\\kilogram\\tothe{-1}'], ['MMOL/L', '\\milli\\mole\\litre\\tothe{-1}'], ['G/KG', '\\gram\\kilogram\\tothe{-1}'], ['ML', '\\mega\\litre'], ['KG', '\\kilogram'],
  ['U/L', ''], ['AU', ''], ['G', ''], ['GY', '']]) {
  add('14 Capitals', u, e, { why: e ? (u === 'ML' ? 'ML is the megalitre (capital M is mega)' : 'read in lower case: every symbol is a usual lower-case one') : 'capitals change the meaning of SI symbols: not converted', cite: 'SI brochure 5.2 (symbols are case-sensitive)' });
}

// ── 15. D-SI strings typed in the form (checked, kept as written)
const TYPED = [
  ['\\metre', ''], ['\\milli\\gram\\kilogram\\tothe{-1}', ''], ['\\kilogram\\metre\\tothe{-3}', ''], ['\\micro\\metre\\tothe{0.5}', ''], ['\\metre\\tothe{-0.5}', ''],
  ['\\metre\\tothe{+2}', ''], ['\\metre\\tothe{0}', ''], ['\\percent', ''], ['\\ppm', ''], ['\\degreecelsius', ''], ['\\mmhg', ''], ['\\milli\\bar', ''], ['\\kilo\\tonne', ''],
  ['\\mega\\electronvolt', ''], ['\\milli\\neper', ''], ['\\milli\\bel', ''], ['\\metre\\per\\second', ''], ['\\kilogram\\per\\metre\\tothe{3}', ''], ['\\kibi\\byte', ''], ['\\mebi\\bit', ''],
  ['\\ronna\\gram', ''], ['\\quecto\\metre', ''], ['\\one', ''], ['\\arcminute', ''], ['\\hectare', ''],
  ['\\kilo\\gram', 'R011'], ['\\deci\\bel', 'R012'], ['\\milli\\kilogram', 'R010'], ['\\kilo\\hour', 'R010'], ['\\milli\\minute', 'R010'], ['\\kilo\\day', 'R010'], ['\\milli\\one', 'R010'],
  ['\\milli\\decibel', 'R010'], ['\\kilo\\degreecelsius', 'R010'], ['\\micro\\mmhg', 'R010'], ['\\milli\\degree', 'Section 3'], ['\\one\\tothe{2}', 'R014'], ['\\metre\\tothe{1.5}', 'R013'],
  ['\\metre\\tothe{02}', 'R013'], ['\\metre\\tothe{2.0}', 'R013'], ['\\metre\\tothe', 'R013'], ['\\milli\\micro\\metre', 'R009'], ['\\metre\\tothe{2}\\tothe{3}', 'R009'], ['\\milli', 'R009'],
  ['\\tothe{2}', 'R009'], ['\\micro\\metre\\milli\\second', 'R015'], ['\\micro\\metre\\tothe{-1}\\milli\\second\\tothe{-1}', 'R015'], ['\\milli\\metre\\tothe{0}\\kilo\\metre', 'R015'],
  ['\\Metre', 'R007'], ['\\metre \\second', 'R007'], ['\\meter', 'R008'], ['\\metres', 'R008'], ['\\milligram', 'R008'], ['\\metre{2}', 'R008'], ['metre', 'R008'], ['\\metre\\', 'R008'],
  ['\\percent\\tothe{2}', 'D-SI 2.2.1'], ['\\milli\\percent', 'D-SI 2.2.1'], ['\\kilo\\byte', 'D-SI 2.2.1'], ['\\kibi\\metre', 'D-SI 2.2.1'], ['\\metre\\per\\second\\per\\second', 'D-SI 2.2.1'],
  ['\\per\\second', 'D-SI 2.2.1'], ['\\metre\\per', 'D-SI 2.2.1'],
];
const RULE_PAGE = { R007: 'R007 p. 71', R008: 'R008 pp. 71–72', R009: 'R009 p. 72', R010: 'R010 p. 72', R011: 'R011 p. 72', R012: 'R012 p. 72', R013: 'R013 p. 73', R014: 'R014 p. 73', R015: 'R015 p. 73', 'Section 3': 'Section 3 p. 16', 'D-SI 2.2.1': 'D-SI 2.2.1 unit list' };
for (const [u, rule] of TYPED) add('15 D-SI strings typed in the form', u, rule ? '' : u, { rule, why: rule ? `breaks ${rule}` : 'valid: kept as written', cite: rule ? RULE_PAGE[rule] : 'Appendix C pp. 69–83; D-SI 2.2.1 unit list' });

// ── 16. Spelling variants of the same unit
const VARIANTS = [
  ['µg/kg', 'micro sign µ'], ['μg/kg', 'Greek mu μ'], ['ug/kg', 'letter u'], ['mg·kg⁻¹', 'half-high dot and superscript'], ['mg⋅kg^-1', 'dot operator and caret'], ['mg*kg-1', 'asterisk'],
  ['mg kg-1', 'space and minus'], ['mg/kg ', 'trailing space'], ['  mg/kg', 'leading spaces'], ['mg / kg', 'spaces around /'], ['mg/kg', 'plain'],
];
for (const [u, why] of VARIANTS) add('16 Spelling variants', u, u.includes('µ') || u.includes('μ') || u.startsWith('ug') ? '\\micro\\gram\\kilogram\\tothe{-1}' : '\\milli\\gram\\kilogram\\tothe{-1}', { why, cite: 'Section 3' });
for (const [u, why] of [['Ω', 'Ohm sign Ω (U+2126)'], ['Ω', 'Greek capital omega Ω'], ['kΩ', 'prefix k'], ['Å', 'Ångström sign Å'], ['Å', 'A with ring Å'], ['°C', 'degree + C'], ['℃', 'degree Celsius sign ℃'], ['ºC', 'masculine ordinal º + C'], ['˚C', 'ring above ˚ + C']]) {
  add('16 Spelling variants', u, u.includes('Ω') ? (u.startsWith('k') ? '\\kilo\\ohm' : '\\ohm') : /Å|Å/.test(u) ? '\\angstrom' : '\\degreecelsius', { why, cite: 'Table A.3 p. 49' });
}

// ── 17. Information units (D-SI 2.2.1): binary prefixes only
for (const [u, e] of [['bit', '\\bit'], ['byte', '\\byte'], ['KiB', '\\kibi\\byte'], ['MiB', '\\mebi\\byte'], ['GiB', '\\gibi\\byte'], ['Kibit', '\\kibi\\bit'], ['kbit', ''], ['kB', ''], ['MB', '']]) {
  add('17 Information units (D-SI 2.2.1)', u, e, { why: e ? 'binary prefix' : 'decimal prefixes are not allowed with bit and byte (and kB/MB are ambiguous)', cite: 'D-SI 2.2.1 unit list (binary prefixes)' });
}

module.exports = { SCENARIOS: S.filter(s => !s.soft) };
if (require.main === module) console.log(S.length, 'scenarios');
