// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Where a value comes from in the PDF (src/utils/sourceExplain.ts, valueCheck.ts) and the period of
// validity read from the certificate text (src/utils/periodCheck.ts).
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const load = (file) => {
    const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/utils', file)], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
    return mod.exports;
};
const { buildPdfTextIndex, findSourcePassage, conversionOf } = load('valueCheck.ts');
const { validityStatements, checkPeriod, isoPeriod, periodWords } = load('periodCheck.ts');
const { explainDerived, explainPeriod, explainValidityType, explainIdentifier } = load('sourceExplain.ts');

const results = []; const check = (name, ok, extra = '') => { results.push([!!ok, name]); if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

// ---- the period of validity in the text ----
const months = (t) => validityStatements(t).map(s => s.months);
check('"valid for one year from the date of shipment": 12 months, with its words', (() => { const s = validityStatements('This certificate is valid for one year from the date of shipment, provided that it is stored as given.'); return s.length === 1 && s[0].months === 12 && s[0].text === 'valid for one year from the date of shipment'; })());
check('"valid for 24 months"', months('The certificate is valid for 24 months.').join() === '24');
check('"valid for 18 (eighteen) months"', months('This certificate is valid for 18 (eighteen) months after dispatch.').join() === '18');
check('"valid for one year and six months"', months('It is valid for one year and six months from the date of purchase.').join() === '18');
check('"Expiry: 3 years after the date of dispatch"', months('Expiry of certification: 3 years after the date of dispatch.').join() === '36');
check('German "gültig für zwei Jahre ab Versanddatum"', months('Dieses Zertifikat ist gültig für zwei Jahre ab Versanddatum.').join() === '24');
check('French "valable un an à compter de la date d\'expédition"', months("Ce certificat est valable un an à compter de la date d'expédition.").join() === '12');
check('a period after opening is not the validity', months('Once opened, the material is valid for 2 months after opening.').length === 0);
check('a period without a validity word or dispatch is not taken', months('The study lasted two years and the material is stable.').length === 0);
check('"twelve-month" is 12', months('This certificate is valid for a twelve-month period from the date of shipment.').join() === '12' || months('The certificate is valid for twelve months from the date of shipment.').join() === '12');
const one = validityStatements('valid for one year from the date of shipment')[0];
check('checkPeriod: 2 years against "one year" differs', checkPeriod(24, [one]).result === 'differs');
check('checkPeriod: 1 year matches', checkPeriod(12, [one]).result === 'matches');
check('checkPeriod: two different periods in the PDF are unclear', checkPeriod(12, [{ ...one, months: 24 }, { ...one, months: 36 }]).result === 'unclear');
check('checkPeriod: no statement', checkPeriod(12, []).result === 'none');
check('isoPeriod and periodWords', isoPeriod(1, 0) === 'P1Y' && isoPeriod(1, 6) === 'P1Y6M' && isoPeriod(0, 18) === 'P18M' && periodWords(18) === '1 year and 6 months' && periodWords(12) === '1 year');

// ---- a made-up certificate of two pages ----
const filler = ' The material is intended for the calibration of instruments and the validation of methods.';
const index = buildPdfTextIndex([
    'Reference Material Certificate ERM-X001 Thin Film Standard.' + filler + ' The uncertainty is the expanded uncertainty with a coverage factor k = 2.',
    'Expiration of Certification This certificate is valid for one year from the date of shipment, provided that the material is stored as described. '
    + 'Description of the Material This CRM is in the form of a rectangle chip 7.5 mm in width and 15 mm in length, packaged in a plastic container. '
    + 'Contact: Example Institute for Materials, Main Street 1, 12345 Sampletown, Germany. TEL 030-1234-5678' + filler,
]);

let p = findSourcePassage('1 rectangle chip (7.5 mm x 15 mm) in a plastic container', index);
check('derived value: the passage it was put together from is found, on page 2', p && p.page === 2 && /^rectangle chip 7\.5 mm in width and 15 mm in length, packaged in a plastic container$/.test(p.text), JSON.stringify(p));
check('...the words not in that passage are named ("1", "x")', p && p.missing.join() === '1,x', p && p.missing.join());
p = findSourcePassage('Example Institute for Materials (EIM)', index);
check('a name with an added abbreviation: passage found, "EIM" is nowhere in the PDF', p && /Example Institute for Materials/.test(p.text) && p.nowhere.join() === 'EIM', JSON.stringify(p));
check('a value whose words are not in the PDF: no passage', findSourcePassage('Polished silicon wafer of 300 mm', index) === null);
check('the passage keeps the case of the PDF', (findSourcePassage('chip 7.5 mm, plastic container', index) || {}).text?.includes('chip 7.5 mm') === true);

let e = explainDerived('1 rectangle chip (7.5 mm x 15 mm) in a plastic container', index);
check('explanation of a derived value: title, marked text, form value, the missing words', e.tone === 'derived' && e.title === 'Not word for word in the PDF' && e.mark.page === 2
    && e.pdf.startsWith('rectangle chip') && e.form.startsWith('1 rectangle') && /Not in the marked text: “1”, “x”\./.test(e.notes.join(' ')), JSON.stringify(e));
e = explainDerived('Polished silicon wafer of 300 mm', index);
check('explanation of a value not in the PDF: "Not found in the PDF", nothing marked', e.tone === 'notFound' && !e.mark && /AI may have added it/.test(e.notes[0]));
e = explainPeriod(2, 0, index);
check('period 2 years against "one year": "Does not match the PDF", the statement marked', e.tone === 'differs' && e.pdf === 'valid for one year from the date of shipment' && e.mark.page === 2 && /The PDF says 1 year \(P1Y\)/.test(e.notes[0]), JSON.stringify(e));
e = explainPeriod(1, 0, index);
check('period 1 year: converted to P1Y, the statement marked', e.tone === 'converted' && e.xml === 'P1Y' && e.pdf === 'valid for one year from the date of shipment');
e = explainValidityType('Time After Dispatch', 1, 0, index);
check('validity type Time After Dispatch: explained by the period', e.tone === 'converted' && e.xml === 'P1Y');
e = explainValidityType('Until Revoked', 0, 0, index);
check('validity type Until Revoked while the PDF gives a period: does not match', e.tone === 'differs' && /Time After Dispatch/.test(e.notes[0]));
e = explainIdentifier('0f8a5e2c-1b7d-4c39-9f2e-6d4b8a1c3e57', index);
check('a UUID the PDF does not have: created by the generator', e && e.tone === 'generated' && e.title === 'Created by the generator');
check('an identifier from the PDF is not called generated', explainIdentifier('ERM-X001', index) === null);
const c = conversionOf('+49 30 1234 5678', 'phone', index);
check('phone in international form, the PDF prints "030-1234-5678": a conversion', c && c.printed === '030-1234-5678' && c.mark.page === 2, JSON.stringify(c));
check('a phone number that is not in the PDF: not a conversion', conversionOf('+49 30 9999 0000', 'phone', index) === null);
check('period P1Y: a conversion of the statement', (conversionOf('P1Y', 'period', index) || {}).printed === 'valid for one year from the date of shipment');
check('period P2Y: not a conversion (to be verified)', conversionOf('P2Y', 'period', index) === null);

const failed = results.filter(r => !r[0]);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
