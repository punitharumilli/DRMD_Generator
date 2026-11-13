// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Values the AI filled in, checked against the PDF text (src/utils/valueCheck.ts), and the form that
// is saved in the XML so that a file opens again unchanged (src/utils/formState.ts).
const path = require('path');
const esbuild = (() => { try { return require('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const load = (file) => {
    const out = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/utils', file)], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
    return mod.exports;
};
const { buildPdfTextIndex, conversionOf, isInPdf, valueKey } = load('valueCheck.ts');
const { formOf, formFromState, formStateJson } = load('formState.ts');
const { buildDrmdXml, FORM_STATE_COMMENT } = load('xmlGenerator.ts');

const results = []; const check = (name, ok, extra = '') => { results.push([!!ok, name]); if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const filler = ' The material is intended for the calibration of instruments and for the validation of methods used to determine the mass fraction of elements.'.repeat(3);

// ---- conversions for machine readability ----
const aist = buildPdfTextIndex([
    'certificate of reference material nmij crm 5205-a page 1' + filler.toLowerCase(),
    'the expanded uncertainty is obtained by multiplying the combined standard uncertainty by a coverage factor (k) of 2, and it is the half-width of an interval estimated to have a level of confidence of approximately 95 %. specific surface area 0,028 m2/g. batch 100 000 units. bundesanstalt, 12205 berlin, germany',
]);
let c = conversionOf('0.95', 'probability', aist, 2);
check('P 0.95 with "95 %" in the PDF: a conversion, printed "95 %"', c && c.printed === '95 %' && c.written === '0.95', JSON.stringify(c));
check('...marked as a phrase that holds the percentage, on page 2', c && c.mark.page === 2 && /approximately 95 %$/.test(c.mark.text), c && c.mark.text);
check('...with the reason', c && /between 0 and 1/.test(c.reason));
check('P "95 %" typed in the form: also a conversion to 0.95', (conversionOf('95 %', 'probability', aist) || {}).written === '0.95');
check('P 0.99 when the PDF says 95 %: not a conversion (to be verified)', conversionOf('0.99', 'probability', aist) === null);
check('P 0.95 when the PDF says 195 %: not taken for 95 %', conversionOf('0.95', 'probability', buildPdfTextIndex(['a level of 195 % was reached' + filler])) === null);
check('P 0.95 printed as "0.95": nothing was converted', conversionOf('0.95', 'probability', buildPdfTextIndex(['p = 0.95 and k = 2' + filler])) === null);
check('P 0.95 with "95 percent" in the PDF', (conversionOf('0.95', 'probability', buildPdfTextIndex(['confidence of about 95 percent' + filler])) || {}).printed === '95 percent');
check('P 0.954 with "95,4 %" in the PDF (decimal comma)', (conversionOf('0.954', 'probability', buildPdfTextIndex(['vertrauensniveau von 95,4 %' + filler])) || {}).written === '0.954');
c = conversionOf('0.028', 'number', aist);
check('number 0.028, printed "0,028": a conversion (decimal comma)', c && c.printed === '0,028' && c.written === '0.028', JSON.stringify(c));
c = conversionOf('0,028', 'number', aist);
check('number typed "0,028": written as 0.028', c && c.written === '0.028');
check('number 2, printed as 2: not a conversion', conversionOf('2', 'number', aist) === null);
check('number typed "8,24", printed "8.24": the PDF already prints it as the XML writes it', conversionOf('8,24', 'number', buildPdfTextIndex(['thickness 8.24 nm' + filler])) === null);
check('number 100000, printed "100 000": digit groups', (conversionOf('100000', 'number', aist) || {}).printed === '100 000');
check('number 0.027 (not in the PDF): not a conversion', conversionOf('0.027', 'number', aist) === null);
c = conversionOf('DE', 'country', aist);
check('country DE with "Germany" in the PDF: a conversion', c && c.printed === 'Germany' && c.written === 'DE', JSON.stringify(c));
check('country FR (not in the PDF): not a conversion', conversionOf('FR', 'country', aist) === null);
check('D-SI unit in the unit column: a conversion', (conversionOf('\\milli\\gram\\kilogram\\tothe{-1}', 'unit', aist) || {}).written === '\\milli\\gram\\kilogram\\tothe{-1}');
check('a printed unit is not taken for a D-SI conversion', conversionOf('mg/kg', 'unit', aist) === null);
check('an invalid D-SI string is not a conversion', conversionOf('\\milli\\kilo\\gram', 'unit', aist) === null);
check('no PDF text: nothing is a conversion', conversionOf('0.95', 'probability', buildPdfTextIndex(['95 %'])) === null);
check('word for word: "BCR-017" matches "BCR® – 017"', isInPdf('BCR-017', buildPdfTextIndex(['bcr® – 017' + filler])));
check('value keys ignore case and punctuation', valueKey('BCR-017') === valueKey('bcr 017') && valueKey('BCR-017') !== valueKey('BCR-018') && valueKey('  ') === '');

// ---- the saved form ----
const doc = {
    administrativeData: {
        title: 'referenceMaterialCertificate', uniqueIdentifier: 'u-1', documentVersion: '1.0', dataVersion: 0,
        documentIdentifiers: [{ scheme: 'DOI', value: '10.1/x', link: 'javascript:alert(1)' }],
        validityType: 'Specific Time', durationY: 0, durationM: 0, dateOfIssue: '', specificTime: '31.02.2030',
        producers: [
            { uuid: 'p1', name: 'BAM', email: 'a@b.de', phone: '', fax: '', address: { street: 'Unter den Eichen', streetNo: '87', postCode: '12205', city: 'Berlin', countryCode: 'DE' }, organizationIdentifiers: [{ scheme: 'ROR', value: '03x42jk29', link: 'https://ror.org/03x42jk29' }], originalTexts: { countryCode: 'Germany' }, fieldCoordinates: { name: [1, 10, 10, 20, 200] } },
            { uuid: 'p2', name: 'Second producer', email: '', phone: '', fax: '', address: { street: '', streetNo: '', postCode: '', city: 'Geel', countryCode: 'BE' }, organizationIdentifiers: [] },
        ],
        responsiblePersons: [{ uuid: 'r1', name: 'Dr. A', role: 'Head', description: '', mainSigner: true, cryptElectronicSeal: false, cryptElectronicSignature: false, cryptElectronicTimeStamp: false }],
    },
    materials: [{ uuid: 'm1', xmlId: '', name: 'Li-NMC 111 -- cathode', rmCode: 'BAM-S014', materialClass: 'Powder', description: 'Powder', itemQuantities: '50 g', minimumSampleSize: 'approx. 0.1 g', isCertified: true, materialIdentifiers: [{ scheme: 'LOT', value: '7', link: '' }] }],
    properties: [{ uuid: 'pr1', id: '', name: 'Informative Values', description: '', isCertified: false, procedures: 'BET', materialRef: 'm1', results: [{ uuid: 'res1', name: 'Values', description: 'k = 2', linkedBatchLot: '9', sectionCoordinates: [2, 100, 50, 300, 950], quantities: [
        { uuid: 'q1', name: 'Specific surface area (BET)', value: '0,40', dsiValue: '0.40', dsiUnit: '\\metre\\tothe{2}\\gram\\tothe{-1}', dsiSource: 'rules', unit: 'm²/g', uncertainty: '0.028', coverageFactor: '2', coverageProbability: '', distribution: '', identifiers: [], fieldCoordinates: { value: [2, 120, 600, 130, 650] } },
        { uuid: 'q2', name: 'Lithium', value: '1,234', dsiValue: '', dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}', dsiSource: 'manual', dsiNote: 'typed', unit: 'mg/kg dry mass', uncertainty: '', coverageFactor: '', coverageProbability: '', distribution: '', identifiers: [], description: 'dry mass basis' },
    ] }] }],
    statements: { official: { intendedUse: 'Calibration -- not for food', commutability: '', storageInformation: 'Dry', handlingInstructions: '', metrologicalTraceability: 'SI', healthAndSafety: '', subcontractors: '', legalNotice: '', referenceToCertificationReport: '' }, custom: [] },
    comments: [], documents: [], generalComment: '',
    binaryDocuments: [{ fileName: 'c.pdf', mimeType: 'application/pdf', data: 'JVBERi0xLjQK', rmDocument: true }],
    review: { aiFilled: [valueKey('0,40'), valueKey('0.028'), 'bad key!'], verified: [valueKey('0.028')] },
};
const state = JSON.parse(formStateJson(doc));
const form = formFromState(state);
check('form state: version 2 and no embedded files', state.v === 2 && !('binaryDocuments' in state.form));
check('form state: keeps what the XML cannot hold (printed unit, k without P, second producer, invalid date, material class)',
    form.properties[0].results[0].quantities[1].unit === 'mg/kg dry mass' && form.properties[0].results[0].quantities[0].coverageFactor === '2'
    && form.administrativeData.producers.length === 2 && form.administrativeData.specificTime === '31.02.2030' && form.materials[0].materialClass === 'Powder' && form.materials[0].isCertified === true);
check('form state: keeps coordinates, PDF wording, D-SI source and note, unit context', form.administrativeData.producers[0].originalTexts.countryCode === 'Germany'
    && form.properties[0].results[0].sectionCoordinates.length === 5 && form.properties[0].results[0].quantities[1].dsiSource === 'manual'
    && form.properties[0].results[0].quantities[1].dsiNote === 'typed' && form.properties[0].results[0].quantities[1].description === 'dry mass basis');
check('form state: keeps the values to verify and the marks, drops malformed keys', form.review.aiFilled.length === 2 && form.review.verified[0] === valueKey('0.028'));
check('form state: a link that is not a web address is dropped', form.administrativeData.documentIdentifiers[0].link === '' && form.administrativeData.producers[0].organizationIdentifiers[0].link === 'https://ror.org/03x42jk29');
const again = buildDrmdXml({ ...form, binaryDocuments: doc.binaryDocuments }, { includeAnnotations: false }).xml;
check('form state: gives exactly the same XML again', again === buildDrmdXml(doc, { includeAnnotations: false }).xml);
const notes = (d) => buildDrmdXml(d, { includeAnnotations: false }).notes.map(n => n.code).sort().join(',');
check('form state: gives the same findings again (errors do not disappear on reload)', notes({ ...form, binaryDocuments: doc.binaryDocuments }) === notes(doc) && /XSD-UNCERTAINTY-INCOMPLETE/.test(notes(doc)) && /XSD-PRODUCER-COUNT/.test(notes(doc)), notes(doc));
const xml = buildDrmdXml(doc).xml;
const comment = xml.match(new RegExp(`<!-- ${FORM_STATE_COMMENT}: [^]*? -->`));
check('XML: one comment with the form, no "--" inside it', comment && !comment[0].slice(4, -3).includes('--') && xml.split(FORM_STATE_COMMENT).length === 2);
check('XML: the comment does not use AI buzzwords', comment && !/AI-powered/i.test(comment[0]));

// A crafted comment cannot add properties, prototypes or code.
const crafted = JSON.parse('{"v":2,"form":{"__proto__":{"polluted":1},"administrativeData":{"producers":[{"name":{"x":1},"organizationIdentifiers":[{"link":"javascript:alert(1)"}],"fieldCoordinates":{"__proto__":[1,2,3,4,5],"constructor":[1,2,3,4,5],"name":[1,2,3,4,5]}}],"validityType":"<script>"},"properties":[{"results":[{"quantities":[{"value":7,"dsiSource":"evil","onclick":"x"}]}]}],"review":{"aiFilled":["<img>", "abc"],"verified":"x"}}}');
const f2 = formFromState(crafted);
check('crafted form: no prototype pollution', ({}).polluted === undefined && Object.getPrototypeOf(f2) === Object.prototype && !('polluted' in f2));
check('crafted form: unknown fields dropped, types fixed', f2.administrativeData.producers[0].name === '' && f2.administrativeData.validityType === 'Until Revoked'
    && f2.properties[0].results[0].quantities[0].value === '7' && f2.properties[0].results[0].quantities[0].dsiSource === undefined && !('onclick' in f2.properties[0].results[0].quantities[0]));
check('crafted form: links and coordinate names checked', f2.administrativeData.producers[0].organizationIdentifiers[0].link === ''
    && Object.keys(f2.administrativeData.producers[0].fieldCoordinates).join() === 'name');
check('crafted form: review keys checked', f2.review.aiFilled.join() === 'abc' && f2.review.verified.length === 0);
check('another version or no form: not used', formFromState({ v: 1, form: {} }) === null && formFromState(null) === null && formFromState({ producers: [] }) === null);
check('formOf: a document without review has none', !('review' in formOf({ ...doc, review: undefined })));

// ---- values that only say "missing" (src/utils/absentValues.ts) ----
const { isAbsentValue, withoutAbsentValues } = load('absentValues.ts');
for (const t of ['N/A', 'n/a', 'N/a', 'n/A', 'NA', 'na', ' NA ', '-', '--', '–', '—', '?', 'none', 'None', 'nil', 'unknown',
    'Not specified', 'not stated.', 'Information not available', 'Not given in the certificate', 'not found in the PDF']) {
    check(`missing: "${t}" is emptied`, isAbsentValue(t));
}
for (const t of ['nA', 'Na', ' Na ', 'mA', 'Ag', 'K', 'Fe', 'NaCl', 'Na2O', 'nA/V', 'n.a.', 'Nano', 'nanoampere', 'sodium', 'not', 'A', '0', '-1', '- 5']) {
    check(`real value: "${t}" is kept`, !isAbsentValue(t));
}
const answer = withoutAbsentValues({
    properties: [{ name: 'Mass fraction', results: [{ name: 'Elements', quantities: [
        { name: 'Na', value: '12.3', unit: 'mg/kg', uncertainty: 'N/A' },
        { name: 'K', value: '4.5', unit: 'mg/kg', uncertainty: '-' },
        { name: 'Current', value: '20', unit: 'nA', uncertainty: '0.5' },
        { name: 'NA', value: '1', unit: 'n/a', uncertainty: 'not specified' }] }] }],
    fieldCoordinates: { name: 'N/A' }, originalTexts: '{"unit":"n/a"}',
});
const q = answer.properties[0].results[0].quantities;
check('answer: element Na and unit nA kept', q[0].name === 'Na' && q[2].unit === 'nA' && q[1].name === 'K');
check('answer: N/A, -, NA, n/a and "not specified" emptied', q[0].uncertainty === '' && q[1].uncertainty === '' && q[3].name === '' && q[3].unit === '' && q[3].uncertainty === '');
check('answer: numbers and units kept', q[0].value === '12.3' && q[0].unit === 'mg/kg' && q[3].value === '1');
check('answer: PDF positions and printed texts untouched', answer.fieldCoordinates.name === 'N/A' && answer.originalTexts === '{"unit":"n/a"}');

const failed = results.filter(r => !r[0]);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
