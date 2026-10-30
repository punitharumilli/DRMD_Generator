// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * D-SI unit rules for the generator.
 *
 * Sources, cited with their page numbers wherever a rule is applied:
 *  - SmartCom, "Digital System of Units (D-SI). Guide for the use of the metadata-format used in
 *    metrology for the easy-to-use, safe, harmonised and unambiguous digital transfer of metrological
 *    data", version 1.3, second edition, 2020, DOI 10.5281/zenodo.3816686 (below: "D-SI guide").
 *    Section 3 (SI unit format, pp. 12–17), Section 8 (medal system, pp. 39–41), Appendix A
 *    (Tables A.1–A.6, pp. 47–55) and Appendix C (rules R001–R055, pp. 69–83). Page numbers are the
 *    ones printed on the pages; in the PDF file a page is 4 further on (front matter).
 *  - PTB, D-SI XML exchange format version 2.2.1, 2024, DOI 10.5281/zenodo.12200678, unit list
 *    (wiki/doc/UnitSystem.md). It is the D-SI version the DRMD schema imports, and it adds \percent,
 *    \ppm, \bit, \byte, the binary prefixes, \ronna, \quetta, \ronto, \quecto and the division
 *    operator \per. These are marked `dsi2` and named as such wherever they are explained.
 *
 * The one principle of everything here: a value from the certificate is never changed. A unit is only
 * ever written as a D-SI expression of exactly the same size. Where that needs an SI prefix or a unit
 * of a lower quality class, the class is lower; where no such expression exists, the unit stays as it
 * is (class "improvable") instead of being converted with a factor. A unit is converted only when it
 * can be read in one way: an element symbol, a hardness scale or "dBm" is never taken for SI symbols.
 */

// ─────────────────────────────── Sources and page numbers ───────────────────────────────

export const DSI_GUIDE_URL = 'https://zenodo.org/records/3816686';
export const DSI_GUIDE_PDF_URL = 'https://zenodo.org/records/3816686/files/2020_07-01_SmartCom_Deliverable_D1_Zenodo-2.pdf';
export const DSI_GUIDE_CITATION = 'D-SI guide v1.3 (SmartCom, 2020), DOI 10.5281/zenodo.3816686';
export const DSI2_URL = 'https://zenodo.org/records/12200678';
export const DSI2_CITATION = 'D-SI 2.2.1 unit list (PTB, 2024), DOI 10.5281/zenodo.12200678';

/** The PDF has four pages of front matter without page numbers. */
const PDF_PAGE_OFFSET = 4;

/** Printed page of each rule, table and section of the D-SI guide that the generator applies. */
export const GUIDE_PAGE: Record<string, number> = {
    'Section 3': 12, 'Table 3.1': 14, 'Semantics of prefixes': 14, 'Semantics of exponents': 15, 'Unit multiplication': 15,
    'Table 3.2': 16, 'Syntax recommendations': 16, 'Section 4': 18, 'Value format': 19, 'Section 7': 31, 'Figure 7.2': 35,
    'Conversion factors': 38, 'Section 8': 39, 'Table 5.1': 39, 'Platinum': 40, 'Gold': 40, 'Silver': 41, 'Bronze': 41,
    'Improvable': 41, 'Hybrid class': 41, 'Table A.1': 47, 'Table A.2': 48, 'Table A.3': 49, 'Table A.4': 52, 'Table A.5': 53,
    'Table A.6': 55, 'Appendix B': 56, 'Appendix C': 69,
    R001: 69, R002: 69, R003: 70, R004: 70, R005: 70, R006: 71, R007: 71, R008: 71, R009: 72, R010: 72, R011: 72, R012: 72,
    R013: 73, R014: 73, R015: 73, R016: 73, R017: 74, R018: 74, R019: 74, R020: 75, R021: 75, R022: 75, R023: 75, R024: 76,
    R025: 76, R026: 76, R027: 76, R028: 77, R029: 77, R030: 77, R031: 77, R032: 78, R033: 78, R034: 78, R035: 78, R036: 79,
    R037: 79, R038: 79, R039: 80, R040: 80, R041: 80, R042: 80, R043: 81, R044: 81, R045: 81, R046: 81, R047: 81, R048: 81,
    R049: 82, R050: 82, R051: 82, R052: 83, R053: 83, R054: 83, R055: 83,
};

/** "R011" → "R011, D-SI guide p. 72"; "Table A.3" → "Table A.3, D-SI guide p. 49". */
export const cite = (ref: string): string => (GUIDE_PAGE[ref] ? `${ref}, D-SI guide p. ${GUIDE_PAGE[ref]}` : ref);
/** "R011" → "R011 (p. 72)" for lists where the guide is named once. */
const ref = (key: string): string => (GUIDE_PAGE[key] ? `${key} (p. ${GUIDE_PAGE[key]})` : key);
/** The guide's PDF opened at a printed page. */
export const guidePageUrl = (page: number): string => `${DSI_GUIDE_PDF_URL}#page=${page + PDF_PAGE_OFFSET}`;

export type DsiClass = 'platinum' | 'gold' | 'silver' | 'bronze' | 'improvable';
export const DSI_CLASS_RANK: Record<DsiClass, number> = { platinum: 0, gold: 1, silver: 2, bronze: 3, improvable: 4 };
export const DSI_CLASS_LABEL: Record<DsiClass, string> = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze', improvable: 'Improvable' };
/** The page of the guide that defines each class (Section 8 and rules R017 to R020). */
export const DSI_CLASS_PAGE: Record<DsiClass, number> = { platinum: 74, gold: 74, silver: 74, bronze: 75, improvable: 41 };

/** What each quality class allows (D-SI guide, Section 8 and rules R017 to R020). */
export const DSI_CLASS_MEANING: Record<DsiClass, string> = {
    platinum: 'only SI base units and the units \\one, \\day, \\hour, \\minute, \\degree, \\arcminute and \\arcsecond, without SI prefixes (D-SI guide Section 8, p. 40; rule R017, p. 74)',
    gold: 'SI units with SI prefixes and SI derived units such as \\gram or \\pascal (D-SI guide Section 8, p. 40; rule R018, p. 74)',
    silver: 'units outside the SI that are accepted for use with it, such as \\litre or \\tonne (D-SI guide Section 8, p. 41; rule R019, p. 74)',
    bronze: 'units of the previous (8th) edition of the SI brochure that are no longer in the current one, such as \\bar (D-SI guide Section 8, p. 41; rule R020, p. 75)',
    improvable: 'the unit has no D-SI form of the same size, so it could only be converted by changing the value (D-SI guide Section 8, p. 41)',
};

// Dimension exponents: metre, kilogram, second, ampere, kelvin, mole, candela, plane angle, information.
// Angle and information are kept apart so that a radian or a bit is never taken for the unit one.
type Dim = number[];
const dimOf = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0, ang = 0, info = 0): Dim => [m, kg, s, A, K, mol, cd, ang, info];
const ZERO: Dim = dimOf();
const addDim = (a: Dim, b: Dim, times = 1): Dim => a.map((v, i) => v + b[i] * times);
const sameDim = (a: Dim, b: Dim) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

export interface DsiUnitDef {
    /** Identifier without the backslash, e.g. "metre". */
    id: string;
    name: string;
    cls: Exclude<DsiClass, 'improvable'>;
    /** Where the identifier is defined, with page numbers. */
    ref: string;
    /** Size in coherent SI units; null where no fixed factor applies (logarithmic and natural units). */
    factor: number | null;
    dim: Dim;
    /** Must not carry an SI prefix (rules R010 to R012, Section 3, Table A.5 notes, D-SI 2 notes). */
    noPrefix?: boolean;
    /** Must not carry an exponent (rule R014; D-SI 2 notes for \percent and \ppm). */
    noExponent?: boolean;
    /** Temperature scale with an offset (degree Celsius), or a logarithmic ratio. */
    special?: 'affine' | 'log';
    /** From the D-SI 2.2.1 unit list, not from the D-SI guide 1.3. */
    dsi2?: boolean;
    /** Takes binary prefixes only (\bit, \byte; D-SI 2.2.1 unit list). */
    binaryOnly?: boolean;
    /**
     * A unit that names a kind of quantity (hertz and becquerel are both s⁻¹). It is never swapped
     * for another unit of the same size and dimension.
     */
    named?: boolean;
}

const PI = Math.PI;
const U = (id: string, name: string, cls: DsiUnitDef['cls'], source: string, factor: number | null, dim: Dim, extra: Partial<DsiUnitDef> = {}): DsiUnitDef =>
    ({ id, name, cls, ref: source, factor, dim, ...extra });
const T1 = `${ref('Table A.1')}, ${ref('R017')}`;
const T2 = `${ref('Table A.2')}, ${ref('R017')}`;
const T3 = `${ref('Table A.3')}, ${ref('R018')}`;
const T4 = `${ref('Table A.4')}, ${ref('R019')}`;
const T20 = ref('R020');
const D2 = 'D-SI 2.2.1 unit list (not in the D-SI guide 1.3)';

/** Every unit identifier of the D-SI guide (Tables A.1 to A.4, rule R020) and of the D-SI 2.2.1 unit list. */
export const DSI_UNITS: DsiUnitDef[] = [
    // Table A.1, SI base units: platinum (R017)
    U('metre', 'metre', 'platinum', T1, 1, dimOf(1)),
    U('kilogram', 'kilogram', 'platinum', T1, 1, dimOf(0, 1), { noPrefix: true }),
    U('second', 'second', 'platinum', T1, 1, dimOf(0, 0, 1)),
    U('ampere', 'ampere', 'platinum', T1, 1, dimOf(0, 0, 0, 1)),
    U('kelvin', 'kelvin', 'platinum', T1, 1, dimOf(0, 0, 0, 0, 1)),
    U('mole', 'mole', 'platinum', T1, 1, dimOf(0, 0, 0, 0, 0, 1)),
    U('candela', 'candela', 'platinum', T1, 1, dimOf(0, 0, 0, 0, 0, 0, 1)),
    // Table A.2, extended SI base units ("SI++"): platinum (R017)
    U('one', 'one', 'platinum', T2, 1, ZERO, { noPrefix: true, noExponent: true }),
    U('day', 'day', 'platinum', T2, 86400, dimOf(0, 0, 1), { noPrefix: true }),
    U('hour', 'hour', 'platinum', T2, 3600, dimOf(0, 0, 1), { noPrefix: true }),
    U('minute', 'minute', 'platinum', T2, 60, dimOf(0, 0, 1), { noPrefix: true }),
    U('degree', 'degree (plane angle)', 'platinum', T2, PI / 180, dimOf(0, 0, 0, 0, 0, 0, 0, 1), { noPrefix: true, named: true }),
    U('arcminute', 'arcminute', 'platinum', T2, PI / 10800, dimOf(0, 0, 0, 0, 0, 0, 0, 1), { named: true }),
    U('arcsecond', 'arcsecond', 'platinum', T2, PI / 648000, dimOf(0, 0, 0, 0, 0, 0, 0, 1), { named: true }),
    // Table A.3, SI derived units: gold (R018)
    U('gram', 'gram', 'gold', T3, 1e-3, dimOf(0, 1)),
    U('radian', 'radian', 'gold', T3, 1, dimOf(0, 0, 0, 0, 0, 0, 0, 1), { named: true }),
    U('steradian', 'steradian', 'gold', T3, 1, dimOf(0, 0, 0, 0, 0, 0, 0, 2), { named: true }),
    U('hertz', 'hertz', 'gold', T3, 1, dimOf(0, 0, -1), { named: true }),
    U('newton', 'newton', 'gold', T3, 1, dimOf(1, 1, -2)),
    U('pascal', 'pascal', 'gold', T3, 1, dimOf(-1, 1, -2)),
    U('joule', 'joule', 'gold', T3, 1, dimOf(2, 1, -2)),
    U('watt', 'watt', 'gold', T3, 1, dimOf(2, 1, -3)),
    U('coulomb', 'coulomb', 'gold', T3, 1, dimOf(0, 0, 1, 1)),
    U('volt', 'volt', 'gold', T3, 1, dimOf(2, 1, -3, -1)),
    U('farad', 'farad', 'gold', T3, 1, dimOf(-2, -1, 4, 2)),
    U('ohm', 'ohm', 'gold', T3, 1, dimOf(2, 1, -3, -2)),
    U('siemens', 'siemens', 'gold', T3, 1, dimOf(-2, -1, 3, 2)),
    U('weber', 'weber', 'gold', T3, 1, dimOf(2, 1, -2, -1)),
    U('tesla', 'tesla', 'gold', T3, 1, dimOf(0, 1, -2, -1)),
    U('henry', 'henry', 'gold', T3, 1, dimOf(2, 1, -2, -2)),
    U('degreecelsius', 'degree Celsius', 'gold', T3, 1, dimOf(0, 0, 0, 0, 1), { noPrefix: true, special: 'affine', named: true }),
    U('lumen', 'lumen', 'gold', T3, 1, dimOf(0, 0, 0, 0, 0, 0, 1, 2)),
    U('lux', 'lux', 'gold', T3, 1, dimOf(-2, 0, 0, 0, 0, 0, 1, 2)),
    U('becquerel', 'becquerel', 'gold', T3, 1, dimOf(0, 0, -1), { named: true }),
    U('sievert', 'sievert', 'gold', T3, 1, dimOf(2, 0, -2), { named: true }),
    U('gray', 'gray', 'gold', T3, 1, dimOf(2, 0, -2), { named: true }),
    U('katal', 'katal', 'gold', T3, 1, dimOf(0, 0, -1, 0, 0, 1), { named: true }),
    // Table A.4, non-SI units accepted for use with the SI: silver (R019)
    U('hectare', 'hectare', 'silver', T4, 1e4, dimOf(2)),
    U('litre', 'litre', 'silver', T4, 1e-3, dimOf(3)),
    U('tonne', 'tonne', 'silver', T4, 1e3, dimOf(0, 1)),
    U('electronvolt', 'electronvolt', 'silver', T4, 1.602176634e-19, dimOf(2, 1, -2)),
    // CODATA 2022 (the dalton is only matched by its own symbols; its size never converts a value)
    U('dalton', 'dalton', 'silver', T4, 1.66053906892e-27, dimOf(0, 1)),
    U('astronomicalunit', 'astronomical unit', 'silver', T4, 149597870700, dimOf(1)),
    U('neper', 'neper', 'silver', T4, null, ZERO, { special: 'log', named: true }),
    U('bel', 'bel', 'silver', T4, null, ZERO, { special: 'log', named: true }),
    U('decibel', 'decibel', 'silver', T4, null, ZERO, { special: 'log', named: true, noPrefix: true }),
    // Rule R020, units of the 8th edition of the SI brochure: bronze. Natural and atomic units have no
    // fixed factor here; they are only ever matched by their own name.
    U('angstrom', 'ångström', 'bronze', T20, 1e-10, dimOf(1)),
    U('atomicunittime', 'atomic unit of time', 'bronze', T20, null, dimOf(0, 0, 1)),
    U('atomicmassunit', 'unified atomic mass unit', 'bronze', T20, 1.66053906892e-27, dimOf(0, 1)),
    U('bar', 'bar', 'bronze', T20, 1e5, dimOf(-1, 1, -2)),
    U('barn', 'barn', 'bronze', T20, 1e-28, dimOf(2)),
    U('clight', 'speed of light (natural unit)', 'bronze', T20, null, dimOf(1, 0, -1)),
    U('electronmass', 'electron mass (natural unit)', 'bronze', T20, null, dimOf(0, 1)),
    U('elementarycharge', 'elementary charge (atomic unit)', 'bronze', T20, null, dimOf(0, 0, 1, 1)),
    U('knot', 'knot', 'bronze', T20, 1852 / 3600, dimOf(1, 0, -1)),
    U('mmhg', 'millimetre of mercury', 'bronze', T20, 133.322387415, dimOf(-1, 1, -2), { noPrefix: true }),
    U('naturalunittime', 'natural unit of time', 'bronze', T20, null, dimOf(0, 0, 1)),
    U('nauticalmile', 'nautical mile', 'bronze', T20, 1852, dimOf(1)),
    U('hartree', 'hartree (atomic unit of energy)', 'bronze', T20, null, dimOf(2, 1, -2)),
    U('bohr', 'bohr (atomic unit of length)', 'bronze', T20, null, dimOf(1)),
    U('planckbar', 'reduced Planck constant (natural unit)', 'bronze', T20, null, dimOf(2, 1, -1)),
    // D-SI 2.2.1 unit list (PTB): gold
    U('percent', 'percent', 'gold', D2, 1e-2, ZERO, { noPrefix: true, noExponent: true, dsi2: true, named: true }),
    U('ppm', 'parts per million', 'gold', D2, 1e-6, ZERO, { noPrefix: true, noExponent: true, dsi2: true, named: true }),
    U('bit', 'bit', 'gold', D2, 1, dimOf(0, 0, 0, 0, 0, 0, 0, 0, 1), { dsi2: true, binaryOnly: true, named: true }),
    U('byte', 'byte', 'gold', D2, 8, dimOf(0, 0, 0, 0, 0, 0, 0, 0, 1), { dsi2: true, binaryOnly: true, named: true }),
];
const UNIT_BY_ID = new Map(DSI_UNITS.map(u => [u.id, u]));

export interface DsiPrefixDef { id: string; symbol: string[]; pow: number; dsi2?: boolean }

/** Table A.5 (p. 53): SI prefixes, quality class gold (R018), plus the four prefixes of 2022 (D-SI 2.2.1). */
export const DSI_PREFIXES: DsiPrefixDef[] = [
    { id: 'deca', symbol: ['da'], pow: 1 }, { id: 'hecto', symbol: ['h'], pow: 2 }, { id: 'kilo', symbol: ['k'], pow: 3 },
    { id: 'mega', symbol: ['M'], pow: 6 }, { id: 'giga', symbol: ['G'], pow: 9 }, { id: 'tera', symbol: ['T'], pow: 12 },
    { id: 'peta', symbol: ['P'], pow: 15 }, { id: 'exa', symbol: ['E'], pow: 18 }, { id: 'zetta', symbol: ['Z'], pow: 21 },
    { id: 'yotta', symbol: ['Y'], pow: 24 }, { id: 'deci', symbol: ['d'], pow: -1 }, { id: 'centi', symbol: ['c'], pow: -2 },
    { id: 'milli', symbol: ['m'], pow: -3 }, { id: 'micro', symbol: ['µ', 'u'], pow: -6 }, { id: 'nano', symbol: ['n'], pow: -9 },
    { id: 'pico', symbol: ['p'], pow: -12 }, { id: 'femto', symbol: ['f'], pow: -15 }, { id: 'atto', symbol: ['a'], pow: -18 },
    { id: 'zepto', symbol: ['z'], pow: -21 }, { id: 'yocto', symbol: ['y'], pow: -24 },
    // 27th CGPM (2022): in D-SI strings only. Their symbols R, Q, r, q are not read from certificate
    // text, where they would be taken for other things.
    { id: 'ronna', symbol: [], pow: 27, dsi2: true }, { id: 'quetta', symbol: [], pow: 30, dsi2: true },
    { id: 'ronto', symbol: [], pow: -27, dsi2: true }, { id: 'quecto', symbol: [], pow: -30, dsi2: true },
];
/** Binary prefixes (D-SI 2.2.1 unit list): powers of 2, only with \bit and \byte. */
export const DSI_BINARY_PREFIXES: DsiPrefixDef[] = [
    { id: 'kibi', symbol: ['Ki'], pow: 10 }, { id: 'mebi', symbol: ['Mi'], pow: 20 }, { id: 'gibi', symbol: ['Gi'], pow: 30 },
    { id: 'tebi', symbol: ['Ti'], pow: 40 }, { id: 'pebi', symbol: ['Pi'], pow: 50 }, { id: 'exbi', symbol: ['Ei'], pow: 60 },
    { id: 'zebi', symbol: ['Zi'], pow: 70 }, { id: 'yobi', symbol: ['Yi'], pow: 80 },
];
const PREFIX_BY_ID = new Map(DSI_PREFIXES.map(p => [p.id, p]));
const BINARY_BY_ID = new Map(DSI_BINARY_PREFIXES.map(p => [p.id, p]));
// The generator itself only writes the prefixes of the D-SI guide (Table A.5)
const PREFIX_BY_POW = new Map(DSI_PREFIXES.filter(p => !p.dsi2).map(p => [p.pow, p]));

// ─────────────────────────────── Checking a D-SI unit string ───────────────────────────────

export interface DsiIssue {
    rule: string;
    message: string;
    /** Printed page of the D-SI guide; absent for the D-SI 2.2.1 unit list. */
    page?: number;
}

const DSI2_RULE = 'D-SI 2.2.1';
const issue = (rule: string, message: string, pageKey?: string): DsiIssue => {
    if (rule === DSI2_RULE) return { rule, message };
    const page = GUIDE_PAGE[pageKey ?? rule];
    return page ? { rule, message, page } : { rule, message };
};
/** "… (R011, D-SI guide p. 72)" or "… (D-SI 2.2.1 unit list, DOI …)". */
export const issueText = (e: DsiIssue): string =>
    `${e.message} (${e.rule === DSI2_RULE ? DSI2_CITATION : e.page ? `${e.rule}, D-SI guide p. ${e.page}` : e.rule})`;
export const issuesText = (list: DsiIssue[]): string => list.map(issueText).join(' ');

export interface DsiToken {
    prefix?: string;
    unit: string;
    exp: number;
}

export interface DsiCheck {
    /** Written as given, without errors. */
    ok: boolean;
    tokens: DsiToken[];
    errors: DsiIssue[];
    /** Remarks that do not make the unit invalid (bronze units, \per, the reciprocal second with a prefix). */
    notes: DsiIssue[];
    cls: DsiClass;
    /** Size in coherent SI units; null when a unit has no fixed factor. */
    factor: number | null;
    dim: Dim;
    /** Written with the D-SI 2 division operator \per. */
    hasPer: boolean;
}

export const formatDsi = (tokens: DsiToken[]): string =>
    tokens.map(t => `${t.prefix ? `\\${t.prefix}` : ''}\\${t.unit}${t.exp !== 1 ? `\\tothe{${String(t.exp)}}` : ''}`).join('');

// Section 3 "Semantics of exponents" (p. 15) and R013 (p. 73): integers without leading zeros, or ±0.5
const EXPONENT = /^[+-]?(?:0|[1-9]\d*)$|^[+-]?0\.5$/;

/**
 * Reads a D-SI unit string and checks it against the rules of the D-SI guide (R001, R007 to R015,
 * Section 3) and the D-SI 2.2.1 unit list. Returns its quality class, its size and dimension.
 */
export const checkDsi = (input: string): DsiCheck => {
    const text = String(input ?? '');
    const errors: DsiIssue[] = [];
    const notes: DsiIssue[] = [];
    const tokens: Array<DsiToken & { den?: boolean; hasExp?: boolean; binary?: boolean }> = [];
    const fail = (rule: string, message: string, pageKey?: string) => errors.push(issue(rule, message, pageKey));

    if (!text.trim()) return { ok: false, tokens: [], errors: [issue('R001', 'The unit is empty; a value needs a unit.')], notes, cls: 'improvable', factor: null, dim: ZERO, hasPer: false };
    if (/\s/.test(text)) fail('R007', 'A D-SI unit contains no blank spaces, tabs or line breaks.');
    if (/[A-Z]/.test(text)) fail('R007', 'D-SI identifiers are written in lower case.');

    const s = text.replace(/\s+/g, '').toLowerCase();
    const re = /\\([a-z]+)(?:\{([^{}]*)\})?/g;
    let pos = 0;
    let pendingPrefix: string | undefined;
    let per = false;
    let perAt = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
        if (m.index !== pos) fail('R008', `"${s.slice(pos, m.index)}" is not a D-SI identifier: every part of the unit starts with a backslash.`);
        pos = m.index + m[0].length;
        const name = m[1];
        if (name === 'tothe') {
            const last = tokens[tokens.length - 1];
            if (pendingPrefix || !last || (per && perAt === tokens.length)) { fail('R009', '\\tothe{} must follow a unit.'); continue; }
            if (last.hasExp) { fail('R009', 'A unit has at most one exponent (no \\tothe{}\\tothe{}).'); continue; }
            const e = (m[2] ?? '').trim();
            if (!EXPONENT.test(e)) { fail('R013', `The exponent "${e}" is not allowed: integers without leading zeros, or ±0.5 for roots.`); continue; }
            last.exp = Number(e);
            last.hasExp = true;
            continue;
        }
        if (name === 'per') {
            if (pendingPrefix) { fail('R009', `The prefix \\${pendingPrefix} has no unit after it.`); pendingPrefix = undefined; }
            if (per) { fail(DSI2_RULE, 'Only one \\per: all units on its left are divided by all units on its right.'); continue; }
            if (tokens.length === 0) { fail(DSI2_RULE, '\\per needs a unit on its left.'); }
            per = true;
            perAt = tokens.length;
            continue;
        }
        if (m[2] !== undefined) fail('R008', `\\${name}{${m[2]}}: only \\tothe takes a value in braces.`);
        const unit = UNIT_BY_ID.get(name);
        const isPrefix = PREFIX_BY_ID.has(name) || BINARY_BY_ID.has(name);
        if (isPrefix && !unit) {
            if (pendingPrefix) fail('R009', `A unit has at most one prefix (\\${pendingPrefix}\\${name}).`);
            pendingPrefix = name;
            continue;
        }
        if (!unit) { fail('R008', `\\${name} is not a unit identifier of the D-SI.`, 'Table A.1'); pendingPrefix = undefined; continue; }
        tokens.push({ unit: name, exp: 1, ...(pendingPrefix ? { prefix: pendingPrefix, binary: BINARY_BY_ID.has(pendingPrefix) } : {}), den: per });
        pendingPrefix = undefined;
    }
    if (pos !== s.length) fail('R008', `"${s.slice(pos)}" is not a D-SI identifier: every part of the unit starts with a backslash.`);
    if (pendingPrefix) fail('R009', `The prefix \\${pendingPrefix} has no unit after it.`);
    if (per && perAt === tokens.length) fail(DSI2_RULE, '\\per needs a unit on its right.');
    if (tokens.length === 0 && errors.length === 0) fail('R008', 'No unit identifier found.');
    // \per: everything on its right is in the denominator
    tokens.forEach(t => { if (t.den) t.exp = -t.exp; });

    for (const t of tokens) {
        const def = UNIT_BY_ID.get(t.unit)!;
        if (t.prefix) {
            if (t.binary && !def.binaryOnly) fail(DSI2_RULE, `The binary prefix \\${t.prefix} is only allowed with \\bit and \\byte.`);
            else if (!t.binary && def.binaryOnly) fail(DSI2_RULE, `\\${t.unit} takes binary prefixes only (\\kibi, \\mebi …), not \\${t.prefix}.`);
            else if (t.unit === 'gram' && t.prefix === 'kilo') fail('R011', '\\kilo\\gram is not allowed: write \\kilogram.');
            else if (t.unit === 'bel' && t.prefix === 'deci') fail('R012', '\\deci\\bel is not allowed: write \\decibel.');
            else if (def.noPrefix) {
                if (def.dsi2) fail(DSI2_RULE, `\\${t.unit} must not have a prefix.`);
                else if (t.unit === 'degree') fail('Section 3', '\\degree must not have a prefix.', 'Syntax recommendations');
                else fail('R010', `\\${t.unit} must not have a prefix.`);
            }
        }
        if (t.exp !== 1 && def.noExponent) {
            if (def.dsi2) fail(DSI2_RULE, `\\${t.unit} must not have an exponent.`);
            else fail('R014', `\\${t.unit} must not have an exponent.`);
        }
    }
    // R015: at most one prefix among the units with a positive (or zero) exponent, one among the negative ones
    const numPrefixes = tokens.filter(t => t.prefix && t.exp >= 0).length;
    const denPrefixes = tokens.filter(t => t.prefix && t.exp < 0).length;
    if (numPrefixes > 1) fail('R015', 'At most one prefix is allowed in the numerator (units with a positive or zero exponent).');
    if (denPrefixes > 1) fail('R015', 'At most one prefix is allowed in the denominator (units with a negative exponent).');

    // Remarks that do not invalidate the unit
    if (tokens.some(t => t.unit === 'second' && t.prefix && t.exp === -1 && !t.binary)) {
        notes.push(issue('Section 3', 'The D-SI guide recommends no prefix on the reciprocal of the second; rule R010 (p. 72) forbids it for quantities of rotation.', 'Syntax recommendations'));
    }
    for (const id of new Set(tokens.filter(t => UNIT_BY_ID.get(t.unit)!.cls === 'bronze').map(t => t.unit))) {
        notes.push(issue('R020', `\\${id} is a unit of the 8th SI brochure (class bronze); it is not in the D-SI 2.2.1 unit list that the DRMD schema uses.`));
    }
    if (per) notes.push(issue(DSI2_RULE, '\\per (division) gives class silver at best; a negative exponent \\tothe{-n} keeps the better class (D-SI guide Section 3, p. 15).'));

    // Quality class: the lowest class of any part; a prefix makes a platinum unit gold (R018); \per is silver
    let rank = per ? DSI_CLASS_RANK.silver : 0;
    let factor: number | null = 1;
    let dim = ZERO;
    for (const t of tokens) {
        const def = UNIT_BY_ID.get(t.unit)!;
        rank = Math.max(rank, DSI_CLASS_RANK[def.cls], t.prefix ? DSI_CLASS_RANK.gold : 0);
        const scale = !t.prefix ? 1 : t.binary ? Math.pow(2, BINARY_BY_ID.get(t.prefix)!.pow) : Math.pow(10, PREFIX_BY_ID.get(t.prefix)!.pow);
        if (def.factor === null || factor === null) factor = null;
        else factor *= Math.pow(def.factor * scale, t.exp);
        dim = addDim(dim, def.dim, t.exp);
    }
    const ok = errors.length === 0;
    const cls: DsiClass = ok ? (['platinum', 'gold', 'silver', 'bronze'] as DsiClass[])[rank] : 'improvable';
    const clean: DsiToken[] = tokens.map(t => ({ unit: t.unit, exp: t.exp, ...(t.prefix ? { prefix: t.prefix } : {}) }));
    return { ok, tokens: clean, errors, notes, cls, factor, dim, hasPer: per };
};

// ─────────────────────────────── Units as written in certificates ───────────────────────────────

type RatioKind = 'mass' | 'amount' | 'volume' | 'massConcentration';

/** A unit symbol from a certificate: a D-SI unit, or a known unit without a D-SI identifier. */
interface SymbolDef {
    /** D-SI identifier, when the symbol has one. */
    dsi?: string;
    /** Several D-SI units in one symbol (M = mol/L). */
    expand?: DsiToken[];
    factor: number | null;
    dim: Dim;
    /** Without a D-SI identifier: written only through an equal-size expression, if one exists. */
    noDsi?: string;
    /** A ratio: its size. Without a D-SI identifier (ppb, ‰), its D-SI form depends on the kind of fraction. */
    ratio?: number;
    /** A unit without a D-SI identifier that is exactly a D-SI expression (cP = mPa s); pow = its power of ten. */
    equiv?: Array<DsiToken & { pow: number }>;
    prefixable?: boolean;
    named?: string;
}

const fromDsi = (id: string, prefixable = true, extra: Partial<SymbolDef> = {}): SymbolDef => {
    const d = UNIT_BY_ID.get(id)!;
    return { dsi: id, factor: d.factor, dim: d.dim, prefixable: prefixable && !d.noPrefix, named: d.named ? id : undefined, ...extra };
};

// Unit symbols as the SI brochure writes them (case matters: "S" is siemens, "s" second, "M" molar).
const SYMBOLS: Record<string, SymbolDef> = {
    m: fromDsi('metre'), g: fromDsi('gram'), kg: fromDsi('kilogram', false), s: fromDsi('second'), A: fromDsi('ampere'),
    K: fromDsi('kelvin'), mol: fromDsi('mole'), cd: fromDsi('candela'),
    min: fromDsi('minute', false), h: fromDsi('hour', false), d: fromDsi('day', false),
    '°': fromDsi('degree', false), '′': fromDsi('arcminute', false), '″': fromDsi('arcsecond', false), rad: fromDsi('radian'), sr: fromDsi('steradian'),
    Hz: fromDsi('hertz'), N: fromDsi('newton'), Pa: fromDsi('pascal'), J: fromDsi('joule'), W: fromDsi('watt'),
    C: fromDsi('coulomb'), V: fromDsi('volt'), F: fromDsi('farad'), 'Ω': fromDsi('ohm'), S: fromDsi('siemens'),
    Wb: fromDsi('weber'), T: fromDsi('tesla'), H: fromDsi('henry'), '°C': fromDsi('degreecelsius', false),
    lm: fromDsi('lumen'), lx: fromDsi('lux'), Bq: fromDsi('becquerel'), Gy: fromDsi('gray'), Sv: fromDsi('sievert'),
    kat: fromDsi('katal'), ha: fromDsi('hectare', false), L: fromDsi('litre'), l: fromDsi('litre'), t: fromDsi('tonne', false),
    eV: fromDsi('electronvolt'), Da: fromDsi('dalton'), u: fromDsi('dalton', false), au: fromDsi('astronomicalunit', false),
    Np: fromDsi('neper', false), dB: fromDsi('decibel', false),
    bar: fromDsi('bar'), 'Å': fromDsi('angstrom', false), mmHg: fromDsi('mmhg', false),
    '%': fromDsi('percent', false, { ratio: 1e-2 }), ppm: fromDsi('ppm', false, { ratio: 1e-6 }),
    bit: fromDsi('bit', false), byte: fromDsi('byte', false),
    // Molar concentration: M = mol/L exactly (SI brochure, 9th edition, Table 8 notes)
    M: { expand: [{ unit: 'mole', exp: 1 }, { unit: 'litre', exp: -1 }], factor: 1e3, dim: dimOf(-3, 0, 0, 0, 0, 1), prefixable: true },
    // Units without a D-SI identifier, known here only so that an equal-size D-SI form can be checked
    ppb: { factor: 1e-9, dim: ZERO, noDsi: 'ppb', ratio: 1e-9 },
    '‰': { factor: 1e-3, dim: ZERO, noDsi: 'per mille', ratio: 1e-3 },
    // 1 P = 0.1 Pa s and 1 St = 1 cm²/s exactly (SI brochure, 8th edition, Table 9)
    P: { factor: 0.1, dim: dimOf(-1, 1, -1), noDsi: 'poise (CGS unit of viscosity)', prefixable: true,
        equiv: [{ unit: 'pascal', exp: 1, pow: -1 }, { unit: 'second', exp: 1, pow: 0 }] },
    St: { factor: 1e-4, dim: dimOf(2, 0, -1), noDsi: 'stokes (CGS unit of kinematic viscosity)', prefixable: true,
        equiv: [{ unit: 'metre', exp: 2, pow: -2 }, { unit: 'second', exp: -1, pow: 0 }] },
    dyn: { factor: 1e-5, dim: dimOf(1, 1, -2), noDsi: 'dyne (CGS unit of force)' },
    erg: { factor: 1e-7, dim: dimOf(2, 1, -2), noDsi: 'erg (CGS unit of energy)' },
};
// Prefix symbols read from certificate text (the 2022 prefixes are not: see DSI_PREFIXES)
const PREFIX_SYMBOLS = DSI_PREFIXES.flatMap(p => p.symbol.map(sym => ({ sym, pow: p.pow }))).sort((a, b) => b.sym.length - a.sym.length);

interface HumanToken { sym: string; def: SymbolDef; pow: number; exp: number; binary?: string }
interface HumanUnit { tokens: HumanToken[]; pow10: number; denPow10: number }

const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };

/** A unit text longer than this is not read as a unit (no unit symbol expression is that long). */
const MAX_UNIT_LENGTH = 120;

const normalizeHuman = (raw: string): string => {
    let s = String(raw ?? '').normalize('NFC').trim();
    s = s.replace(/[    ]/g, ' ');
    s = s.replace(/[µμ]/g, 'µ').replace(/Ω/g, 'Ω').replace(/Å/g, 'Å').replace(/℃/g, '°C')
        .replace(/[º˚]\s*C\b/g, '°C').replace(/°\s+C\b/g, '°C').replace(/[−–]/g, '-');
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, sup => '^' + sup.split('').map(c => SUPERSCRIPT[c]).join(''));
    s = s.replace(/^in\s+/i, '');
    // A whole unit in brackets: "[mg/kg]", "(mg/kg)"
    for (let i = 0; i < 2; i++) {
        const w = s.match(/^\[(.*)\]$/) || s.match(/^\((.*)\)$/);
        if (w && !/[()[\]]/.test(w[1])) s = w[1].trim();
    }
    // "per" written as a word between symbols: "mg per kg" (SI brochure 5.4.6)
    s = s.replace(/\s+per\s+/gi, '/');
    return s.replace(/[·⋅•∙*]/g, ' ').replace(/\bmm\s+Hg\b/g, 'mmHg').replace(/\s+/g, ' ').trim();
};

// ── Things that are not SI unit symbols, although their letters could be read as such ──

/** The 118 chemical elements. An element symbol is never split into two unit symbols ("Hg" is not H·g). */
const ELEMENTS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr '
    + 'Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl '
    + 'Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
const ELEMENT_SET = new Set(ELEMENTS);
/** Element symbols that are read as units wherever they stand (pascal, neper): analytes Pa and Np are rare. */
const ALWAYS_UNIT = new Set(['Pa', 'Np']);
/** Names of the element symbols that are also unit symbols, to recognise them in the context. */
const ELEMENT_NAMES: Record<string, RegExp> = {
    H: /\bhydrogen\b/i, C: /\bcarbon\b|\bTOC\b|\bDOC\b/i, N: /\bnitrogen\b|\bKjeldahl\b/i, F: /\bfluorine\b|\bfluoride\b/i,
    P: /\bphosph(?:orus|ate)\b/i, S: /\bsul(?:ph|f)(?:ur|ate|ide)\b/i, K: /\bpotassium\b/i, V: /\bvanadium\b/i,
    W: /\btungsten\b|\bwolfram\b/i, Mg: /\bmagnesium\b/i, Tm: /\bthulium\b/i, Pm: /\bpromethium\b/i, Ts: /\btennessine\b/i,
    Es: /\beinsteinium\b/i, Ds: /\bdarmstadtium\b/i, Hs: /\bhassium\b/i,
};

/**
 * A nuclide: "137Cs", "³H", "Cs-137", "Tc-99m". "K-1" or "K-4" are exponents (kelvin⁻¹, kelvin⁻⁴), so an
 * element that is also a unit symbol needs a mass number of 5 or more (or is tritium, "H-3").
 */
const isNuclide = (word: string): boolean => {
    const pre = word.match(/^\^?\d{1,3}([A-Z][a-z]?)$/);
    if (pre) return ELEMENT_SET.has(pre[1]);
    const post = word.match(/^([A-Z][a-z]?)-(\d{1,3})m?$/);
    if (!post || !ELEMENT_SET.has(post[1])) return false;
    return !SYMBOLS[post[1]] || Number(post[2]) >= 5 || (post[1] === 'H' && post[2] === '3');
};

/** A chemical formula, ion or nuclide written next to a unit: KOH, CaCO3, NO3-N, H+, Cs-137, 137Cs, Tc-99m. */
const isFormula = (word: string): boolean => {
    if (isNuclide(word)) return true;
    const w = word;
    const parts = w.split('-');
    if (parts.some(p => !p)) return false;
    const valid = parts.every(p => /^(?:\(?(?:[A-Z][a-z]?\d*)+\)?\d*)+(?:\d*[+-])?$/.test(p)
        && (p.match(/[A-Z][a-z]?/g) || []).every(e => ELEMENT_SET.has(e)));
    if (!valid) return false;
    const elements = (w.match(/[A-Z][a-z]?/g) || []).length;
    return parts.length > 1 || /\d|[+-]$/.test(w) || elements >= 2;
};

/**
 * Words that look like unit symbols but are not units of the SI. They are never read as SI symbols
 * (this is what keeps "pH" from being picohenry, "HV" from being henry volt, "dBm" from being decibel
 * metre). Each comes with the reason that is shown.
 */
const NOT_SI: Array<[RegExp, string]> = [
    [/^p(?:K[ab]?|OH|E)$/, 'a p-function (negative decimal logarithm), not a unit'],
    [/^H(?:V|K|B|BW|BS|R[A-Z0-9]*|L|LD|S|M|IT)(?:\d+(?:[.,]\d+)?)?$/, 'a hardness scale, not a unit; the D-SI guide shows such values in si:hybrid (Figure 7.2, p. 35)'],
    [/^Shore$|^IRHD$/, 'a hardness scale, not a unit; the D-SI guide shows such values in si:hybrid (Figure 7.2, p. 35)'],
    [/^d[Bb](?:m|W|V|A|C|c|i|d|FS|SPL|r|Z|µV|uV|mV|µA|uA|pW|\(A\)|\(C\))$/, 'a level relative to a reference (dBm, dBA …), not a D-SI unit'],
    [/^(?:dpm|dps|cpm|cps|cpb|counts?|cts|cnt|events?|impulses?)$/i, 'a count or count rate, which has no D-SI unit of its own'],
    [/^(?:U|IU|AU|EU|ELU|KU|mIU|µIU|uIU|kIU|mU|µU|uU|TCID50|PFU|pfu|CFU|cfu|MPN|copies|copy|cells?|particles?|spores?|colonies|Eq|eq|mEq|meq|µeq|ueq|Osm|osm|mOsm|mosm|val|mval)$/,
        'an arbitrary, enzyme, count or equivalent unit, which has no D-SI unit of the same size'],
    [/^(?:gal|gpm|gph|mpg|mph|kph|fps|ft|in|inch|inches|yd|mi|nmi|mil|thou|lb|lbs|lbf|oz|gr|grain|ct|carat|psi|psia|psig|atm|at|ata|Torr|torr|mTorr|inHg|mmH2O|cmH2O|inH2O|mH2O|kgf|kp|gf|tf|BTU|Btu|cal|kcal|Cal|hp|PS|bhp|therm|quad)$/,
        'a unit outside the SI without a D-SI identifier'],
    [/^(?:G|Gs|Oe|Mx|Gal|mGal|R|rem|mrem|rd|Ci|mCi|µCi|uCi|nCi|pCi|kCi|dpm)$/, 'a CGS or historical unit without a D-SI identifier'],
    [/^(?:Nm\^?3|Nm³|NL|Nl|Nml|sccm|slm|slpm|SLPM|SCCM|scfm|SCFM)$/, 'a volume at standard reference conditions, which needs the conditions as well, not a D-SI unit'],
    [/^(?:cc|CC|ccm)$/, 'an abbreviation (cubic centimetre or carbon copy); write cm³'],
    [/^°(?:F|R|Ra|Re|Ré|Bx|Brix|Oe|Bé|Be|P|Plato|API|Tw|dH|fH|e|GH|KH)$/, 'a unit or scale outside the SI without a D-SI identifier'],
    [/^(?:NTU|FNU|FTU|EBC|ASBC|Hazen|APHA|Pt-Co|PtCo|RLU|OD|Abs|ABS|mAU|AU)$/, 'an optical or instrument scale, which has no D-SI unit'],
    [/^(?:lg|log|ln|Kd|Kow|logKow|ppth|pph|pphm|pptr|ppq|ppt|pptv|ppqv)$/, 'not a unit of the SI (or an ambiguous ratio: ppt is "per thousand" or "per trillion")'],
    [/^(?:year|years|yr|annum|month|months|week|weeks|wk|a)$/, 'a calendar unit without a fixed size in the SI'],
    [/^(?:Grad|grad|gon|gons)$/, 'a gradian or the German word for degree, not a D-SI unit'],
    [/^(?:DM|TS|TM|DW|WW|FW|BW|dw|ww|fw|bw)$/, 'a note about the basis of the result (dry mass, fresh weight …), not a unit'],
];
const notSiReason = (word: string): string | null => {
    for (const [re, why] of NOT_SI) if (re.test(word)) return `"${word}" is ${why}.`;
    return null;
};

const symbolToken = (item: string): HumanToken | null => {
    const m = item.match(/^([^\d^+-][^\d^]*?)(?:\^?([+-]?\d+(?:\.5)?))?$/);
    if (!m) return null;
    const sym = m[1];
    const exp = m[2] !== undefined ? Number(m[2]) : 1;
    if (!Number.isFinite(exp) || exp === 0) return null;
    const exact = SYMBOLS[sym];
    if (exact) return { sym, def: exact, pow: 0, exp };
    // Binary prefixes, only with bit and byte (D-SI 2.2.1): KiB, Mibit
    const bin = sym.match(/^(Ki|Mi|Gi|Ti|Pi|Ei|Zi|Yi)(bit|B|byte)$/);
    if (bin) {
        const pre = DSI_BINARY_PREFIXES.find(p => p.symbol[0] === bin[1])!;
        return { sym, def: bin[2] === 'bit' ? SYMBOLS.bit : SYMBOLS.byte, pow: 0, exp, binary: pre.id };
    }
    for (const p of PREFIX_SYMBOLS) {
        if (!sym.startsWith(p.sym) || sym.length === p.sym.length) continue;
        const rest = SYMBOLS[sym.slice(p.sym.length)];
        if (rest && rest.prefixable) return { sym, def: rest, pow: p.pow, exp };
    }
    return null;
};

/**
 * "mgkg-1", "Nm", "kWh": two symbols written without a space between them. Only when exactly one
 * reading is plausible; element symbols, formulas and known non-SI words are never split.
 */
const splitJoined = (item: string): HumanToken[] | null => {
    if (item.length > 24) return null;
    const m = item.match(/^([^\d^+-]+?)(\^?[+-]?\d+(?:\.5)?)?$/);
    if (!m) return null;
    const letters = m[1];
    const expPart = m[2] || '';
    // "°F" is not degree times farad: a degree sign is never split off
    if (letters.startsWith('°')) return null;
    if (ELEMENT_SET.has(letters) || isFormula(item) || notSiReason(item) || notSiReason(letters)) return null;
    // A prefix symbol written onto a unit symbol is a prefixed unit (SI brochure 5.4.3): "mh" is the
    // milli-hour (not allowed), not metre hour; "kd" is not kilogram day … so it is never split.
    if (PREFIX_SYMBOLS.some(p => letters.startsWith(p.sym) && letters.length > p.sym.length && SYMBOLS[letters.slice(p.sym.length)])) return null;
    const readings: HumanToken[][] = [];
    for (let cut = 1; cut < letters.length; cut++) {
        const a = symbolToken(letters.slice(0, cut));
        const b = a && symbolToken(letters.slice(cut) + expPart);
        if (a && b) readings.push([a, b]);
    }
    if (readings.length <= 1) return readings[0] ?? null;
    // Several readings ("Pas": Pa s or P as): the one without CGS units and extreme prefixes, if unique
    const penalty = (r: HumanToken[]) => r.reduce((sum, t) => sum + (Math.abs(t.pow) >= 15 ? 2 : 0) + (t.def.equiv ? 1 : 0) + (t.sym === 'u' ? 1 : 0), 0);
    const best = Math.min(...readings.map(penalty));
    const top = readings.filter(r => penalty(r) === best);
    return top.length === 1 ? top[0] : null;
};

const parseGroup = (group: string, sign: 1 | -1, out: HumanToken[]): number | null => {
    let pow10 = 0;
    // "100g" → "100" "g"
    const items = group.split(' ').filter(Boolean).flatMap(it => { const n = it.match(/^(10*)(\D.*)$/); return n ? [n[1], n[2]] : [it]; });
    for (const item of items) {
        const p = item.match(/^(?:(10*)|10\^([+-]?\d+))$/);
        if (p) { pow10 += sign * (p[1] !== undefined ? p[1].length - 1 : Number(p[2])); continue; }
        if (notSiReason(item)) return null;
        const t = symbolToken(item);
        const ts = t ? [t] : splitJoined(item);
        if (!ts) return null;
        for (const x of ts) out.push({ ...x, exp: x.exp * sign });
    }
    return pow10;
};

/** Symbols, operators and powers of ten only (annotations already taken off). */
const parseCore = (input: string): HumanUnit | null => {
    let s = String(input ?? '').replace(/\s+/g, ' ').trim();
    if (!s || s.length > MAX_UNIT_LENGTH) return null;
    let pow10 = 0;
    // A power of ten in front: "x 10^3 g/mol", "×10^-3", "10^6 Bq"
    const mult = s.match(/^(?:[x×]\s*)?10\s*\^\s*([+-]?\d+)\s*/i);
    if (mult) { pow10 += Number(mult[1]); s = s.slice(mult[0].length).trim(); }
    if (!s) return null;
    // Split at "/" outside parentheses; everything after a "/" is in the denominator
    const groups: string[] = [];
    let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '(' || ch === '[') { depth++; cur += ' '; continue; }
        if (ch === ')' || ch === ']') { depth = Math.max(0, depth - 1); cur += ' '; continue; }
        if (ch === '/' && depth === 0) { groups.push(cur); cur = ''; continue; }
        cur += ch;
    }
    groups.push(cur);
    if (groups.some(g => !g.trim())) return null;
    const tokens: HumanToken[] = [];
    let denPow10 = 0;
    for (let i = 0; i < groups.length; i++) {
        const p = parseGroup(groups[i].replace(/\s+/g, ' ').trim(), i === 0 ? 1 : -1, tokens);
        if (p === null) return null;
        pow10 += p;
        if (i > 0) denPow10 += p;
    }
    if (tokens.length === 0) return null;
    return { tokens, pow10, denPow10 };
};

// ── What a unit text says besides its unit: kind of fraction, basis, analyte ──

export type UnitNoteType = 'kind' | 'basis' | 'analyte' | 'as' | 'comment' | 'quantity';
export interface UnitNote { text: string; type: UnitNoteType }

export interface UnitAnalysis {
    /** The unit symbols only, after the notes about the kind, the basis or the analyte were taken off. */
    core: string;
    /** What was taken off, as written. */
    notes: UnitNote[];
    kind?: RatioKind;
    /** Two notes name different kinds of fraction. */
    kindConflict?: boolean;
    /** The text names something that is not a unit of the SI (hardness scale, dBm, cfu …): the reason. */
    notUnit?: string;
    /** A symbol that may be a unit or an element ("mg/kg N"): the context has to decide. */
    ambiguous?: { token: string; reason: string; coreWithout: string };
    /** A quantity of dimension one: "pH", "dimensionless". */
    dimensionOne?: boolean;
}

/** Units in which an analyte, a basis or a sample can be named next to them: mass, amount, volume, activity, ratios. */
const isHostToken = (t: HumanToken): boolean => {
    const id = t.def.dsi;
    if (id && ['gram', 'kilogram', 'tonne', 'dalton', 'mole', 'litre', 'becquerel', 'percent', 'ppm'].includes(id)) return true;
    if (id === 'metre' && Math.abs(t.exp) === 3) return true;
    return t.def.ratio !== undefined || !!t.def.expand;
};
/** A content: amount of something (mass, amount, volume, activity) per amount of sample, or a ratio. */
const isContent = (h: HumanUnit | null): boolean => {
    if (!h || h.tokens.length === 0) return false;
    const num = h.tokens.filter(t => t.exp > 0);
    const den = h.tokens.filter(t => t.exp < 0);
    const areaOrHost = (t: HumanToken) => isHostToken(t) || t.def.dsi === 'hectare' || (t.def.dsi === 'metre' && Math.abs(t.exp) === 2);
    return num.length > 0 && num.every(isHostToken) && den.every(areaOrHost);
};

const KIND_OF_PAIR = (a: string, b: string): RatioKind | undefined => {
    const m = /^(?:m|w|g)$/, v = /^(?:v|V|mL|ml)$/, n = /^(?:mol|n)$/;
    if (m.test(a) && m.test(b)) return 'mass';
    if (/^(?:v|V)$/.test(a) && /^(?:v|V)$/.test(b)) return 'volume';
    if (n.test(a) && n.test(b)) return 'amount';
    if (m.test(a) && v.test(b)) return 'massConcentration';
    return undefined;
};
const RATIO_SYMBOL = '(?:%|‰|ppm|ppb|ppt)';
const BASIS_PHRASE = /(?:\b(?:on|in|of|per)\s+(?:a\s+|the\s+)?)?\b(?:dry|wet|fresh|oven[-\s]?dried?|air[-\s]?dried?)(?:\s+(?:mass|matter|weight|wt\.?|basis|substance|sample|material))?\b|\bas\s+received\b|\bas\s+is\b/gi;
const BASIS_CODE = /^(?:d\.?m\.?|DM|d\.w\.|dw|DW|w\.w\.|ww|WW|f\.w\.|fw|FW|TS|TM|b\.w\.|bw|BW|db|DB|wb|WB)$/;

/**
 * Separates the unit symbols from what else the unit text says: the kind of a fraction ("% (m/m)",
 * "mass %"), the basis ("dry mass", "as received"), the analyte ("mg N/kg", "µg/L as N", "mg Hg/kg")
 * and comments in brackets. Such words are not part of a unit: a D-SI unit is built only from unit,
 * prefix and exponent identifiers (D-SI guide Section 3, pp. 12–17).
 */
export const analyzeUnit = (raw: string): UnitAnalysis => {
    const notes: UnitNote[] = [];
    const kinds: RatioKind[] = [];
    if (String(raw ?? '').length > MAX_UNIT_LENGTH) return { core: '', notes, notUnit: `The unit text is ${String(raw).length} characters long; that is not a unit.` };
    let s = normalizeHuman(raw);
    // Quantities of dimension one
    if (/^(?:dimensionless|unitless|non-dimensional|no unit|without unit|one|1)$/i.test(s)) return { core: '1', notes, dimensionOne: true };
    if (/^pH(?:\s+(?:units?|value|scale))?$/.test(s)) return { core: '1', notes: [{ text: s, type: 'quantity' }], dimensionOne: true };
    let unknownKind = false;
    const addKind = (k: RatioKind | undefined, text: string) => { if (k) kinds.push(k); else unknownKind = true; notes.push({ text: text.trim(), type: 'kind' }); };

    // Kind of fraction: in brackets anywhere, "(m/m)" "(V/V)" "(w/v)" "(mol/mol)"
    s = s.replace(/[([]\s*(m|w|g|v|V|mol|n)\s*\/\s*(m|w|g|v|V|mL|ml|mol|n)\s*[)\]]/g, (all, a, b) => { addKind(KIND_OF_PAIR(a, b), all); return ' '; });
    // … without brackets only right after a ratio ("% m/m", "ppm v/v"): elsewhere "W/m" or "V/V" are units
    s = s.replace(new RegExp(`(${RATIO_SYMBOL})\\s*(m|w|g|v|V|mol|n)\\s*\\/\\s*(m|w|g|v|V|mL|ml|mol|n)(?![A-Za-z0-9])`, 'g'), (all, r, a, b) => { addKind(KIND_OF_PAIR(a, b), all.slice(r.length)); return `${r} `; });
    // Words: "mass %", "wt.%", "Gew.-%", "vol%", "mol%", "at.%", "% by mass", "ppmv", "ppbw", "mass fraction"
    s = s.replace(/(?<![A-Za-zµ])(?:wt|w|mass|massen|masse|gew|weight)\.?\s*-?\s*%/gi, all => { addKind('mass', all.replace(/%$/, '')); return '%'; });
    s = s.replace(/(?<![A-Za-zµ])(?:vol|v|volume)\.?\s*-?\s*%/gi, all => { addKind('volume', all.replace(/%$/, '')); return '%'; });
    s = s.replace(/(?<![A-Za-zµ])(?:mol|mole|at|atom|n)\.?\s*-?\s*%/gi, all => { addKind('amount', all.replace(/%$/, '')); return '%'; });
    s = s.replace(/%\s*(?:by\s+)?(mass|weight|wt|vol(?:ume)?|mole?|amount)\b\.?/gi, (all, w) => { addKind(/^(?:mass|weight|wt)$/i.test(w) ? 'mass' : /^vol/i.test(w) ? 'volume' : 'amount', all.slice(1)); return '%'; });
    s = s.replace(/\b(ppm|ppb)([vw])\b/g, (_all, r, k) => { addKind(k === 'v' ? 'volume' : 'mass', k); return r; });
    s = s.replace(/\b(mass|weight|volume|amount(?:[\s-]+of[\s-]+substance)?|mole|atom)\s+fractions?\b/gi, (all, w) => {
        addKind(/^(?:mass|weight)$/i.test(w) ? 'mass' : /^vol/i.test(w) ? 'volume' : 'amount', all); return ' ';
    });
    // The quantity named after a ratio: "% RH", "%IACS", "% LEL" (relative humidity, conductivity, lower explosive limit)
    s = s.replace(/(%|‰|ppm)\s*(RH|rH|r\.h\.|rel\.?\s*h\.?|IACS|LEL|LFL|UEL|sat\.?)(?![A-Za-z])/g, (_all, r, q) => { notes.push({ text: q, type: 'quantity' }); return `${r} `; });
    // "as N", "as CaCO3", "as received" after the unit, also in brackets: "(as N)"
    s = s.replace(/[([]\s*as\s+([^()[\]]+?)\s*[)\]]/gi, (_all, what) => { notes.push({ text: `as ${String(what).trim()}`, type: 'as' }); return ' '; });
    const as = s.match(/^(.*?\S)\s+as\s+(\S.*)$/i);
    if (as) { notes.push({ text: `as ${as[2].trim()}`, type: 'as' }); s = as[1]; }
    // The basis: "dry mass", "on dry basis", "fresh weight"
    s = s.replace(BASIS_PHRASE, all => { if (all.trim()) notes.push({ text: all.trim(), type: 'basis' }); return ' '; });
    // Comments in brackets that are not units: "(dry weight)", "(as received)", "[Hg]", "(KOH)"
    s = s.replace(/[([]\s*([^()[\]]*?)\s*[)\]]/g, (all, inner) => {
        const words = String(inner).split(/[\s,]+/).filter(Boolean);
        const isComment = words.length > 0 && !parseCore(inner) && words.every(w => /^[A-Za-z][A-Za-z.'’-]*$/.test(w) || isFormula(w));
        if (!isComment) return all;
        notes.push({ text: all.trim(), type: words.every(w => ELEMENT_SET.has(w) || isFormula(w)) ? 'analyte' : 'comment' });
        return ' ';
    });
    s = s.replace(/[([]\s*[)\]]/g, ' ').replace(/\s+/g, ' ').replace(/\s*,\s*$/, '').trim();
    // A trailing bracket that gives the same unit in another notation ("mm²/s (cSt)", "µg/g (ppm)") is a
    // comment; one that gives a unit of another size ("mg/kg (mmol/kg)") makes the text unreadable.
    let twoUnits = '';
    const trailing = s.match(/^(.*[^/(\s])\s+[([]\s*([^()[\]]+?)\s*[)\]]$/);
    if (trailing) {
        const hx = parseCore(trailing[1]), hy = parseCore(trailing[2]);
        if (hx && hy) {
            const sx = humanSize(hx), sy = humanSize(hy);
            if (sx.factor !== null && sy.factor !== null && sameFactor(sx.factor, sy.factor) && sameDim(sx.dim, sy.dim)) {
                notes.push({ text: `(${trailing[2]})`, type: 'comment' }); s = trailing[1].trim();
            } else twoUnits = `"${trailing[1]}" and "${trailing[2]}" are two units of different size; it is not clear which one the value is in.`;
        }
    }

    // Words that follow a unit of mass, amount, volume or activity: analytes, basis codes, sample words
    const tokens = s.replace(/([/()[\]])/g, ' $1 ').split(' ').filter(Boolean);
    const keep: boolean[] = tokens.map(() => true);
    let ambiguous: UnitAnalysis['ambiguous'];
    let side: 'num' | 'den' = 'num';
    let depth = 0;
    let hostRun = false; // the word before (in the same run) is a host unit, or an annotation that followed one
    const rebuild = (skip: number[]) => tokens.filter((_, i) => keep[i] && !skip.includes(i)).join(' ');
    for (let i = 0; i < tokens.length; i++) {
        const w = tokens[i];
        if (w === '(' || w === '[') { depth++; hostRun = false; continue; }
        if (w === ')' || w === ']') { depth = Math.max(0, depth - 1); hostRun = false; continue; }
        if (w === '/') { if (depth === 0) side = 'den'; hostRun = false; continue; }
        const nuclide = isNuclide(w);
        const tok = nuclide ? null : symbolToken(w);
        if (hostRun) {
            const isElement = ELEMENT_SET.has(w) && !ALWAYS_UNIT.has(w);
            const formula = !isElement && isFormula(w);
            const lowerWord = /^[a-z][a-z-]{2,}$/.test(w) && !tok && !splitJoined(w) && !notSiReason(w);
            if (BASIS_CODE.test(w) || lowerWord) {
                keep[i] = false; notes.push({ text: w, type: 'basis' }); continue;
            }
            if ((isElement || formula) && !tok) {
                keep[i] = false; notes.push({ text: w, type: 'analyte' }); continue;
            }
            if ((isElement || formula) && tok) {
                // An element symbol that is also a unit symbol (N, K, C, S, Mg …) right after a unit of
                // mass, amount, volume or activity. In the numerator ("mg N/kg", "kg N/ha", "% C") it
                // names the analyte: no unit of the SI is a mass times a newton or a kelvin. In the
                // denominator ("mg/kg N", but also "J/(kg K)" and "kg/(m³ K)") it is the analyte only
                // when the unit without it is a content; even then only the context can tell.
                if (side === 'num') { keep[i] = false; notes.push({ text: w, type: 'analyte' }); continue; }
                const without = parseCore(rebuild([i]));
                if (isContent(without) && !ambiguous) {
                    ambiguous = {
                        token: w, coreWithout: rebuild([i]).replace(/\s*\/\s*/g, '/').trim(),
                        reason: `"${w}" after the unit can be the element ${w} (the analyte) or the unit symbol ${w}; the description of the quantity has to say which, so it is not converted by the rules.`,
                    };
                }
            }
        }
        hostRun = !!tok && isHostToken(tok);
    }
    const core = rebuild([]).replace(/\s*\/\s*/g, '/').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').trim();
    const uniqueKinds = Array.from(new Set(kinds));
    const out: UnitAnalysis = { core, notes };
    if (uniqueKinds.length === 1) out.kind = uniqueKinds[0];
    if (uniqueKinds.length > 1 || unknownKind) out.kindConflict = true;
    if (ambiguous) out.ambiguous = ambiguous;
    if (twoUnits && !ambiguous) out.ambiguous = { token: '', reason: twoUnits, coreWithout: '' };
    // Not a unit of the SI: a level in dB relative to a reference, a hardness scale, a count …
    const levelRef = normalizeHuman(raw).match(/\bd[Bb]\s*(?:\(\s*[AC]\s*\)|(?:m|W|V|A|C|c|i|d|FS|SPL|r|Z|µV|uV|mV|µA|uA|pW)(?![A-Za-z]))/);
    // (only for a compound such as "G/KG"; a single word such as "PS" or "AU" keeps its own meaning)
    const capitalsOk = /[/ ]/.test(core) && !/[a-zµ]/.test(core) && core.replace(/[^A-Za-z]/g, '').length >= 2 && !parseCore(core) && !!readCore(core).h;
    if (levelRef) out.notUnit = `"${levelRef[0].replace(/\s+/g, '')}…" is a level relative to a reference (dBm, dBA …), not a D-SI unit.`;
    else if (!capitalsOk) {
        for (const w of core.replace(/([/()[\]])/g, ' ').split(' ').filter(Boolean)) {
            if (ambiguous && w === ambiguous.token) continue;
            const why = notSiReason(w);
            if (why) { out.notUnit = why; break; }
            if (isNuclide(w)) { out.notUnit = `"${w}" is a nuclide, not a unit.`; break; }
            // An element symbol on its own that only a prefix makes a unit ("Mg", "Tm", "Ts") or that is
            // two symbols ("Hg", "Cd", "As")
            if (ELEMENT_SET.has(w) && !ALWAYS_UNIT.has(w) && !SYMBOLS[w] && w.length === 2) {
                out.notUnit = `"${w}" is the symbol of a chemical element; as a unit it could only be read as ${symbolToken(w) ? 'a unit with a prefix' : 'two unit symbols written together'}, so it is not converted.`;
                break;
            }
        }
    }
    if (!core && !out.notUnit) out.notUnit = `"${String(raw).trim()}" names no unit.`;
    return out;
};

/** The unit as read after the notes were taken off; also accepts a unit written in capitals ("MG/KG"). */
const readCore = (core: string): { h: HumanUnit; readAs: string; capitals: boolean } | { h: null; capitalsRejected?: string } => {
    const h = parseCore(core);
    if (h) return { h, readAs: core, capitals: false };
    // Written in capitals only ("MG/KG", "PPM"): read in lower case only when every symbol is one of the
    // usual lower-case ones, so that "U/L", "AU" or "G" are never read as dalton, astronomical unit, gram
    if (!/[a-zµ]/.test(core) && /[A-Z]/.test(core) && core.replace(/[^A-Za-z]/g, '').length >= 2) {
        const lower = core.toLowerCase();
        const hl = parseCore(lower);
        const safeUnit = (t: HumanToken) => (['gram', 'kilogram', 'litre', 'mole', 'metre', 'second', 'minute', 'hour', 'ppm'].includes(t.def.dsi ?? '') || t.sym === 'ppb')
            && [0, 3, -1, -2, -3, -6, -9, -12].includes(t.pow);
        if (hl && hl.tokens.every(safeUnit)) return { h: hl, readAs: lower, capitals: true };
        if (hl) return { h: null, capitalsRejected: lower };
    }
    return { h: null };
};

const humanSize = (h: HumanUnit): { factor: number | null; dim: Dim; numDim: Dim; denDim: Dim } => {
    let factor: number | null = Math.pow(10, h.pow10);
    let dim = ZERO, numDim = ZERO, denDim = ZERO;
    for (const t of h.tokens) {
        const scale = Math.pow(10, t.pow) * (t.binary ? Math.pow(2, BINARY_BY_ID.get(t.binary)!.pow) : 1);
        if (t.def.factor === null || factor === null) factor = null;
        else factor *= Math.pow(t.def.factor * scale, t.exp);
        dim = addDim(dim, t.def.dim, t.exp);
        // M is mol per litre: its parts go to the numerator and the denominator
        const parts = t.def.expand
            ? t.def.expand.map(e => ({ d: UNIT_BY_ID.get(e.unit)!.dim, exp: e.exp * t.exp }))
            : t.def.equiv
            ? t.def.equiv.map(e => ({ d: UNIT_BY_ID.get(e.unit)!.dim, exp: e.exp * t.exp }))
            : [{ d: t.def.dim, exp: t.exp }];
        for (const part of parts) {
            if (part.exp > 0) numDim = addDim(numDim, part.d, part.exp); else denDim = addDim(denDim, part.d, -part.exp);
        }
    }
    return { factor, dim, numDim, denDim };
};

const dsiSides = (tokens: DsiToken[]) => {
    let numDim = ZERO, denDim = ZERO;
    for (const t of tokens) {
        const d = UNIT_BY_ID.get(t.unit)!.dim;
        if (t.exp > 0) numDim = addDim(numDim, d, t.exp); else denDim = addDim(denDim, d, -t.exp);
    }
    return { numDim, denDim };
};

const sameFactor = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

// ─────────────────────────────── Writing a unit in D-SI ───────────────────────────────

export interface DsiResult {
    /** The D-SI unit, or "" when the unit cannot be written in D-SI without changing the value. */
    dsi: string;
    cls: DsiClass;
    /** One or two sentences: how the unit was written and why, with the rules and pages (shown in the notice). */
    explanation: string;
    /** The kind of fraction the conversion relied on (ppb, ‰, % (w/v)). */
    kind?: RatioKind;
    /** Another reading of the symbol is possible; the context decided, or nothing was written. */
    ambiguous?: boolean;
    /** Words of the unit text that are not part of the unit (basis, analyte, kind): kept out of the D-SI unit. */
    notes?: UnitNote[];
    /** The unit is not one of the SI (hardness scale, cfu …): asking the AI cannot help. */
    noAi?: boolean;
    /** The guide page that matters most for this result (for the link in the notice). */
    page?: number;
}

const KIND_UNITS: Record<RatioKind, { label: string }> = {
    mass: { label: 'mass fraction' }, amount: { label: 'amount-of-substance fraction' },
    volume: { label: 'volume fraction' }, massConcentration: { label: 'mass concentration (w/v: gram per millilitre basis)' },
};

/** A ratio without a D-SI identifier (ppb, ‰), or any ratio given as w/v, written as a unit of the stated kind, same size. */
const ratioAsFraction = (ratio: number, kind: RatioKind): DsiToken[] | null => {
    const unitWithPrefix = (unit: string, p: number): DsiToken | null => {
        if (p === 0) return { unit, exp: 1 };
        const prefix = PREFIX_BY_POW.get(p);
        return prefix ? { unit, exp: 1, prefix: prefix.id } : null;
    };
    const p = Math.round(Math.log10(ratio));
    if (!sameFactor(Math.pow(10, p), ratio)) return null;
    if (kind === 'mass') {
        // ratio = g per kg × 10^(p+3)
        const q = p + 3;
        if (q === 3) return [{ unit: 'kilogram', exp: 1 }, { unit: 'kilogram', exp: -1 }];
        const num = unitWithPrefix('gram', q);
        return num ? [num, { unit: 'kilogram', exp: -1 }] : null;
    }
    if (kind === 'amount' || kind === 'volume') {
        const unit = kind === 'amount' ? 'mole' : 'litre';
        const num = unitWithPrefix(unit, p);
        return num ? [num, { unit, exp: -1 }] : null;
    }
    // w/v: the ratio is taken on a gram per millilitre basis (1 % (w/v) = 1 g per 100 mL, Ph. Eur. 1.2)
    const q = p + 3; // g/mL × ratio = g/L × 10^(p+3)
    if (q === 1) return [{ unit: 'gram', exp: 1 }, { unit: 'litre', exp: -1, prefix: 'deci' }];
    const num = unitWithPrefix('gram', q);
    return num ? [num, { unit: 'litre', exp: -1 }] : null;
};

/**
 * Moves the powers of ten of one side of the unit (prefixes and a written factor such as 10³) onto a
 * single prefix, so that the side keeps at most one prefix (rule R015) and the size stays the same.
 */
const settlePrefixes = (tokens: Array<DsiToken & { pow: number; binary?: string }>, numExtra: number, denExtra = 0): DsiToken[] | null => {
    const out = tokens.map(t => ({ ...t }));
    // A power of ten written in the denominator ("per 100 g") stays there, when the denominator has a unit
    if (denExtra !== 0 && !out.some(t => t.exp < 0)) { numExtra += denExtra; denExtra = 0; }
    for (const side of [1, -1] as const) {
        const idx = out.map((t, i) => (Math.sign(t.exp) === side && !t.binary ? i : -1)).filter(i => i >= 0);
        if (idx.length === 0) continue;
        const extra = side === 1 ? numExtra : denExtra;
        const total = idx.reduce((sum, i) => sum + out[i].pow * out[i].exp, 0) + extra;
        const prefixed = idx.filter(i => out[i].pow !== 0);
        if (prefixed.length <= 1 && extra === 0) continue;
        idx.forEach(i => { out[i].pow = 0; });
        if (total === 0) continue;
        // Put the whole power on one unit of this side: the first that can carry the prefix
        let placed = false;
        for (const i of idx) {
            const t = out[i];
            const def = UNIT_BY_ID.get(t.unit)!;
            const canPrefix = !def.noPrefix || t.unit === 'kilogram';
            if (!canPrefix || total % t.exp !== 0) continue;
            let p = total / t.exp;
            if (t.unit === 'kilogram') p += 3; // kilogram is written through gram (R011)
            if (p === 0) { if (t.unit === 'kilogram') { out[i] = { ...t, unit: 'gram', pow: 0 }; } placed = true; break; }
            if (!PREFIX_BY_POW.has(p)) continue;
            out[i] = { ...t, unit: t.unit === 'kilogram' ? 'gram' : t.unit, pow: p };
            placed = true;
            break;
        }
        if (!placed) return null;
    }
    if (numExtra !== 0 && !out.some(t => t.exp > 0)) return null;
    return out.map(t => {
        if (t.binary) return { unit: t.unit, exp: t.exp, prefix: t.binary };
        if (t.unit === 'gram' && t.pow === 3) return { unit: 'kilogram', exp: t.exp };
        const prefix = t.pow ? PREFIX_BY_POW.get(t.pow)?.id : undefined;
        return { unit: t.unit, exp: t.exp, ...(prefix ? { prefix } : {}) };
    });
};

export interface UnitContext {
    /** Texts that describe the quantity, closest first: quantity name, table name and description, property set, procedures, traceability. */
    texts?: string[];
}

/** Kind of fraction named in a text: "% (m/m)", "mass fraction", "mol %" … (used for the context). */
const KIND_PATTERNS: Array<[RatioKind, RegExp]> = [
    ['mass', /\(\s*(?:m|w|g)\s*\/\s*(?:m|w|g)\s*\)|\bwt\.?\s*-?\s*%|\bmass\s*-?\s*%|%\s*(?:by\s+)?(?:mass|weight)\b|\bmass\s+fractions?\b|\bweight\s+fractions?\b/i],
    ['volume', /\(\s*v\s*\/\s*v\s*\)|\bvol\.?\s*-?\s*%|%\s*(?:by\s+)?volume\b|\bvolume\s+fractions?\b/i],
    ['amount', /\(\s*(?:mol|n)\s*\/\s*(?:mol|n)\s*\)|\bmol\.?\s*-?\s*%|\bat\.?\s*-?\s*%|\b(?:amount(?:[\s-]+of[\s-]+substance)?|mole|atom)\s+fractions?\b/i],
];
const kindsIn = (text: string): RatioKind[] => KIND_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);

/** The kind of fraction the closest describing text names, when exactly one is named. */
export const kindFromContext = (unitText: string, ctx?: UnitContext): RatioKind | undefined => {
    const own = analyzeUnit(unitText);
    if (own.kind) return own.kind;
    for (const text of ctx?.texts || []) {
        const kinds = kindsIn(String(text || ''));
        if (kinds.length === 1) return kinds[0];
        if (kinds.length > 1) return undefined;
    }
    return undefined;
};

const TEMPERATURE_WORDS = /\b(temperature|melting|boiling|freezing|flash\s*point|celsius|thermal|heating|cooling)\b|°/i;
const TEMPERATURE_ONLY_WORDS = /\b(temperature|melting|boiling|freezing|flash\s*point|celsius|heating|cooling)\b/i;
const CHARGE_WORDS = /\b(charge|coulomb|capacity|electric)\b/i;
const DOSE_WORDS = /\b(dose|dosimetr\w*|absorbed|irradiat\w*|radiation|kerma|exposure)\b/i;

const notesSentence = (notes: UnitNote[]): string => {
    const other = notes.filter(n => n.type !== 'kind').map(n => `"${n.text}"`);
    const kind = notes.filter(n => n.type === 'kind').map(n => `"${n.text}"`);
    const parts: string[] = [];
    if (other.length) parts.push(`${other.join(', ')} ${other.length > 1 ? 'are' : 'is'} not part of the unit (a D-SI unit is built only from unit, prefix and exponent identifiers, D-SI guide Section 3, pp. 12–17); it is left out of the D-SI unit, so keep it in the quantity name.`);
    if (kind.length) parts.push(`${kind.join(', ')} names the kind of quantity, not a unit; it is left out of the D-SI unit.`);
    return parts.length ? ` ${parts.join(' ')}` : '';
};

/**
 * Writes a unit from the certificate as a D-SI unit of exactly the same size. Deterministic: the same
 * input gives the same output. Returns dsi "" when that is not possible without changing the value, or
 * when the unit text can be read in more than one way.
 */
export const toDsi = (unitText: string, ctx?: UnitContext): DsiResult => {
    const raw = String(unitText ?? '').trim();
    if (!raw) return { dsi: '', cls: 'improvable', explanation: 'No unit is given.', page: GUIDE_PAGE.R001 };
    if (raw.length > MAX_UNIT_LENGTH) return { dsi: '', cls: 'improvable', noAi: true, explanation: `The unit text is ${raw.length} characters long; that is not a unit, so it is not converted.`, page: GUIDE_PAGE.Improvable };
    // Already a D-SI unit: checked, kept as written
    if (raw.startsWith('\\')) {
        const c = checkDsi(raw);
        return c.ok
            ? { dsi: raw.replace(/\s+/g, ''), cls: c.cls, explanation: explainDsi(c), page: DSI_CLASS_PAGE[c.cls] }
            : { dsi: '', cls: 'improvable', noAi: true, explanation: `"${raw}" is not a valid D-SI unit: ${issuesText(c.errors)}`, page: c.errors[0]?.page };
    }
    const a = analyzeUnit(raw);
    const texts = (ctx?.texts || []).join(' ');
    if (a.dimensionOne) {
        const isPh = a.notes.some(n => n.type === 'quantity');
        return {
            dsi: '\\one', cls: 'platinum', notes: a.notes, page: GUIDE_PAGE['Table A.2'],
            explanation: isPh
                ? `pH is a quantity of dimension one (a logarithm), not a unit; D-SI writes quantities of dimension one with \\one (Table A.2, D-SI guide p. 48). Keep "pH" in the quantity name. Class Platinum (R017, p. 74).`
                : `A quantity of dimension one is written with \\one (Table A.2, D-SI guide p. 48). Class Platinum (R017, p. 74).`,
        };
    }
    if (a.notUnit) return { dsi: '', cls: 'improvable', noAi: true, notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `${a.notUnit} It is written as typed (class Improvable, D-SI guide Section 8, p. 41).` };
    if (a.ambiguous) return { dsi: '', cls: 'improvable', ambiguous: true, notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: a.ambiguous.reason };
    if (a.kindConflict) return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `"${raw}" names two different kinds of fraction, or one that is not mass, volume or amount of substance (m/m, V/V, mol/mol, w/v); it is not converted.` };

    const bare = a.core;
    let ambiguous = false;
    let decided = '';
    const read = readCore(bare);
    if (!read.h && 'capitalsRejected' in read && read.capitalsRejected) {
        return { dsi: '', cls: 'improvable', ambiguous: true, notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `"${bare}" is written in capitals; read in lower case it would be "${read.capitalsRejected}", but capitals change the meaning of SI symbols, so it is not converted.` };
    }
    let parsed = read.h;
    let readAs = read.h ? read.readAs : bare;
    if (read.h && read.capitals) { ambiguous = true; decided = ` "${bare}" is written in capitals and read as "${read.readAs}".`; }
    // "C" alone: coulomb by the SI, but certificates also write it for degree Celsius
    if (bare === 'C') {
        if (TEMPERATURE_WORDS.test(texts) && !CHARGE_WORDS.test(texts)) { parsed = parseCore('°C'); readAs = '°C'; decided = ' "C" was read as degree Celsius, because the description of the quantity is about temperature.'; }
        else if (!(CHARGE_WORDS.test(texts) && !TEMPERATURE_WORDS.test(texts))) {
            return { dsi: '', cls: 'improvable', ambiguous: true, notes: a.notes, page: GUIDE_PAGE['Table A.3'], explanation: '"C" is the SI symbol of the coulomb, but certificates also use it for degree Celsius; the description of the quantity does not say which.' };
        } else decided = ' "C" was read as the coulomb, because the description of the quantity is about electric charge.';
        ambiguous = true;
    }
    // "°" alone in a temperature: degree (angle) or degree Celsius?
    if (bare === '°' && TEMPERATURE_ONLY_WORDS.test(texts)) {
        return { dsi: '', cls: 'improvable', ambiguous: true, notes: a.notes, page: GUIDE_PAGE['Table A.2'], explanation: '"°" is the degree of plane angle (Table A.2, p. 48), but the description of the quantity is about a temperature; it is not converted.' };
    }
    if (!parsed) return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `"${raw}" could not be read as a unit of the SI, so no D-SI unit of the same size is known for it (class Improvable, D-SI guide Section 8, p. 41).` };
    // "rad": radian, or the old unit of absorbed dose (1 rad = 0.01 Gy)?
    if (parsed.tokens.some(t => t.def.dsi === 'radian') && DOSE_WORDS.test(texts)) {
        return { dsi: '', cls: 'improvable', ambiguous: true, notes: a.notes, page: GUIDE_PAGE['Table A.3'], explanation: '"rad" is the radian (Table A.3, p. 49), but the description of the quantity is about a dose, where "rad" is the old unit of absorbed dose (0.01 Gy); it is not converted.' };
    }

    // A ratio without a D-SI identifier (ppb, ‰), or any ratio taken as w/v, needs the kind of fraction
    const ratioToken = parsed.tokens.find(t => t.def.ratio !== undefined && (!t.def.dsi || a.kind === 'massConcentration'));
    if (ratioToken) {
        if (parsed.tokens.length !== 1 || ratioToken.exp !== 1 || ratioToken.pow !== 0 || parsed.pow10 !== 0) {
            return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `"${raw}" combines ${ratioToken.def.noDsi ?? ratioToken.sym} with other units; no D-SI unit of the same size is known for it.` };
        }
        const kind = a.kind ?? kindFromContext(raw, ctx);
        if (!kind) {
            return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `D-SI has no identifier for ${ratioToken.def.noDsi}. It can be written as a mass, amount or volume fraction of the same size, but the certificate text does not say which kind of fraction it is.` };
        }
        const tokens = ratioAsFraction(ratioToken.def.ratio!, kind);
        if (!tokens) return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `No D-SI ${KIND_UNITS[kind].label} of the same size as "${ratioToken.sym}" exists.` };
        const c = checkDsi(formatDsi(tokens));
        const how = kind === 'massConcentration'
            ? `"${raw}" is a mass concentration: w/v means grams of substance per millilitre of solution (1 % (w/v) = 1 g per 100 mL, Ph. Eur. General Notices 1.2), so it is not the ratio ${ratioToken.def.dsi ? `\\${ratioToken.def.dsi}` : ratioToken.sym}. It is written`
            : `D-SI has no identifier for ${ratioToken.def.noDsi}; as a ${KIND_UNITS[kind].label} it is written`;
        return {
            dsi: formatDsi(c.tokens), cls: c.cls, kind, notes: a.notes, page: DSI_CLASS_PAGE[c.cls],
            explanation: `${how} ${formatDsi(c.tokens)}, which has the same size, so the value is unchanged. ${explainDsi(c)}${notesSentence(a.notes.filter(n => n.type !== 'kind'))}`,
        };
    }

    const missing = parsed.tokens.find(t => !t.def.dsi && !t.def.expand && !t.def.equiv);
    if (missing) {
        return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: `"${missing.sym}" (${missing.def.noDsi}) has no D-SI identifier, and no D-SI unit of the same size is known for it; converting it would change the value.` };
    }
    const flat: Array<DsiToken & { pow: number; binary?: string }> = [];
    let extraPow = parsed.pow10 - parsed.denPow10;
    const equivNotes: string[] = [];
    for (const t of parsed.tokens) {
        if (t.def.expand) {
            // M → mol L⁻¹; a prefix on M applies to the mole
            t.def.expand.forEach((e, i) => flat.push({ unit: e.unit, exp: e.exp * t.exp, pow: i === 0 ? t.pow : 0 }));
        } else if (t.def.equiv) {
            // cP → mPa s: the unit's own power of ten and its prefix go onto the prefixes of the expression
            t.def.equiv.forEach(e => flat.push({ unit: e.unit, exp: e.exp * t.exp, pow: e.pow }));
            extraPow += t.pow * t.exp;
            equivNotes.push(`"${t.sym}" (${t.def.noDsi}) has no D-SI identifier but is exactly a D-SI expression of the same size`);
        } else {
            flat.push({ unit: t.def.dsi!, exp: t.exp, pow: t.pow, ...(t.binary ? { binary: t.binary } : {}) });
        }
    }
    // The same unit twice on the same side is one unit with the summed exponent ("m/s/s" → m s⁻²)
    for (let i = 0; i < flat.length; i++) {
        for (let j = flat.length - 1; j > i; j--) {
            const x = flat[i], y = flat[j];
            if (x.unit === y.unit && x.pow === y.pow && x.binary === y.binary && Math.sign(x.exp) === Math.sign(y.exp)) { x.exp += y.exp; flat.splice(j, 1); }
        }
    }
    // "k" + "g" is written \kilogram (R011)
    const settled = settlePrefixes(flat.map(t => (t.unit === 'gram' && t.pow === 3 ? { ...t, unit: 'kilogram', pow: 0 } : t)), extraPow, parsed.denPow10);
    if (!settled) {
        return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.R015, explanation: `"${raw}" cannot be written in D-SI with at most one prefix in the numerator and one in the denominator (R015, D-SI guide p. 73) without changing the value.` };
    }
    const c = checkDsi(formatDsi(settled));
    if (!c.ok) {
        return { dsi: '', cls: 'improvable', notes: a.notes, page: c.errors[0]?.page, explanation: `"${raw}" has no valid D-SI form of the same size: ${issuesText(c.errors)}` };
    }
    const check = verifyParsed(readAs, parsed, formatDsi(c.tokens), a.kind);
    if (!check.ok) return { dsi: '', cls: 'improvable', notes: a.notes, page: GUIDE_PAGE.Improvable, explanation: check.reason };
    const pow10Note = parsed.pow10 !== 0 && !parsed.tokens.some(t => t.def.equiv)
        ? ` The power of ten written with the unit is carried by the prefix (prefixes express the powers of ten of a value, D-SI guide Section 8, p. 40), so the number stays as printed.` : '';
    return {
        dsi: formatDsi(c.tokens), cls: c.cls, ambiguous: ambiguous || undefined, notes: a.notes, page: DSI_CLASS_PAGE[c.cls],
        explanation: explainDsi(c) + decided + (equivNotes.length ? ` ${equivNotes.join('; ')}, so the value is unchanged.` : '') + pow10Note + notesSentence(a.notes),
    };
};

/** The parsed unit against a D-SI unit: same size, same quantity on each side, same named units. */
const verifyParsed = (raw: string, h: HumanUnit, dsi: string, kind?: RatioKind): { ok: boolean; reason: string } => {
    const c = checkDsi(dsi);
    if (!c.ok) return { ok: false, reason: `${dsi} breaks the D-SI rules: ${issuesText(c.errors)}` };
    const hs = humanSize(h);
    const special = c.tokens.some(t => UNIT_BY_ID.get(t.unit)!.special) || h.tokens.some(t => t.def.dsi && UNIT_BY_ID.get(t.def.dsi)!.special);
    if (special) {
        // Degree Celsius and logarithmic units: only the very same units qualify
        const flat = h.tokens.map(t => `${t.pow}|${t.def.dsi}|${t.exp}`).join(',');
        const back = c.tokens.map(t => `${t.prefix ? PREFIX_BY_ID.get(t.prefix)?.pow ?? 0 : 0}|${t.unit}|${t.exp}`).join(',');
        return flat === back && h.pow10 === 0 ? { ok: true, reason: '' } : { ok: false, reason: `${dsi} is not the same unit as "${raw}".` };
    }
    // A ratio of a stated kind (ppb as a mass fraction, % (w/v) as a mass concentration): exactly the
    // unit of that kind, and nothing else
    const ratioTok = h.tokens.length === 1 && h.pow10 === 0 && h.tokens[0].def.ratio !== undefined && (!h.tokens[0].def.dsi || kind === 'massConcentration') ? h.tokens[0] : null;
    if (ratioTok) {
        if (!kind) return { ok: false, reason: `"${raw}" has no D-SI identifier and the kind of fraction is not known.` };
        const expect = ratioAsFraction(ratioTok.def.ratio!, kind);
        return expect && formatDsi(expect) === formatDsi(c.tokens) ? { ok: true, reason: '' } : { ok: false, reason: `${dsi} is not a ${KIND_UNITS[kind].label} of the size of "${raw}".` };
    }
    if (hs.factor === null || c.factor === null) return { ok: false, reason: `The size of "${raw}" or ${dsi} is not fixed, so they cannot be compared.` };
    if (!sameDim(hs.dim, c.dim)) return { ok: false, reason: `${dsi} measures a different quantity than "${raw}".` };
    if (!sameFactor(hs.factor, c.factor)) return { ok: false, reason: `${dsi} is not the same size as "${raw}", so the value would have to change.` };
    const sides = dsiSides(c.tokens);
    if (!sameDim(sides.numDim, hs.numDim) || !sameDim(sides.denDim, hs.denDim)) {
        return { ok: false, reason: `${dsi} has the same size as "${raw}" but describes another quantity (numerator and denominator differ).` };
    }
    const namedHuman = new Set(h.tokens.map(t => t.def.named).filter(Boolean) as string[]);
    const namedDsi = new Set(c.tokens.map(t => (UNIT_BY_ID.get(t.unit)!.named ? t.unit : '')).filter(Boolean));
    const sameNamed = namedHuman.size === namedDsi.size && Array.from(namedHuman).every(n => namedDsi.has(n));
    if (!sameNamed) return { ok: false, reason: `${dsi} replaces a named unit of "${raw}" (such as % or Bq) with another one of the same size.` };
    return { ok: true, reason: '' };
};

/**
 * Is the D-SI unit exactly the unit from the certificate? Same size (so the value stays as it is),
 * same dimension in the numerator and in the denominator (mg/kg is not mmol/mol), and the same named
 * units (Bq is not Hz). Notes in the unit text (basis, analyte) are not part of the unit. A ratio
 * without a D-SI identifier may become a fraction of a stated kind.
 */
export const verifySameUnit = (unitText: string, dsi: string, kind?: RatioKind, opts: { ambiguousAsUnit?: boolean } = {}): { ok: boolean; reason: string } => {
    const c = checkDsi(dsi);
    if (!c.ok) return { ok: false, reason: `${dsi} breaks the D-SI rules: ${issuesText(c.errors)}` };
    let raw = String(unitText ?? '').trim();
    if (raw.startsWith('\\')) {
        const o = checkDsi(raw);
        return o.ok && formatDsi(o.tokens) === formatDsi(c.tokens) ? { ok: true, reason: '' } : { ok: false, reason: `${dsi} is not the unit ${raw}.` };
    }
    const a = analyzeUnit(raw);
    if (a.dimensionOne) return formatDsi(c.tokens) === '\\one' ? { ok: true, reason: '' } : { ok: false, reason: `"${raw}" is of dimension one; its D-SI unit is \\one.` };
    if (a.notUnit) return { ok: false, reason: a.notUnit };
    if (a.ambiguous && !(opts.ambiguousAsUnit && a.ambiguous.token)) return { ok: false, reason: a.ambiguous.reason };
    let core = a.core;
    if (core === 'C') core = c.tokens.some(t => t.unit === 'degreecelsius') ? '°C' : 'C';
    const read = readCore(core);
    if (!read.h) return { ok: false, reason: `"${raw}" could not be read as a unit, so ${dsi} cannot be checked against it.` };
    return verifyParsed(raw, read.h, dsi, kind ?? a.kind);
};

/** Why a D-SI unit has its quality class: one sentence per kind of part, with the rules and pages. */
export const explainDsi = (c: DsiCheck): string => {
    if (!c.ok) return `Not a valid D-SI unit: ${issuesText(c.errors)}`;
    const parts: string[] = [];
    const byClass = (cls: DsiClass) => Array.from(new Set(c.tokens.filter(t => UNIT_BY_ID.get(t.unit)!.cls === cls && !UNIT_BY_ID.get(t.unit)!.dsi2).map(t => `\\${t.unit}`)));
    const plat = byClass('platinum');
    const gold = byClass('gold');
    const silver = byClass('silver');
    const bronze = byClass('bronze');
    const dsi2 = Array.from(new Set(c.tokens.filter(t => UNIT_BY_ID.get(t.unit)!.dsi2).map(t => `\\${t.unit}`)));
    const prefixes = Array.from(new Set(c.tokens.filter(t => t.prefix).map(t => `\\${t.prefix}`)));
    if (plat.length) parts.push(`${plat.join(', ')}: platinum (Tables A.1/A.2, pp. 47–48; R017, p. 74)`);
    if (prefixes.length) parts.push(`prefix ${prefixes.join(', ')}: gold (Table A.5, p. 53; R018, p. 74)`);
    if (gold.length) parts.push(`${gold.join(', ')}: SI derived unit, gold (Table A.3, p. 49; R018, p. 74)`);
    if (silver.length) parts.push(`${silver.join(', ')}: accepted for use with the SI, silver (Table A.4, p. 52; R019, p. 74)`);
    if (bronze.length) parts.push(`${bronze.join(', ')}: from the 8th SI brochure, bronze (R020, p. 75)`);
    if (dsi2.length) parts.push(`${dsi2.join(', ')}: gold, from the D-SI 2.2.1 unit list (not in the D-SI guide 1.3)`);
    if (c.tokens.some(t => t.exp < 0) && !c.hasPer) parts.push('division written as a negative exponent \\tothe{-n} (Section 3, p. 15)');
    const notes = c.notes.length ? ` Note: ${issuesText(c.notes)}` : '';
    return `Class ${DSI_CLASS_LABEL[c.cls]} (D-SI guide): ${parts.join('; ')}.${notes}`;
};

/** A short list of the identifiers, for the AI instructions. */
export const dsiIdentifierList = (): string => {
    const line = (cls: DsiUnitDef['cls'], filter: (u: DsiUnitDef) => boolean = () => true) =>
        DSI_UNITS.filter(u => u.cls === cls && filter(u) && !u.binaryOnly).map(u => `\\${u.id}`).join(' ');
    return [
        `PLATINUM (no prefix allowed to stay platinum): ${line('platinum')}`,
        `GOLD (SI derived units): ${line('gold', u => !u.dsi2)}`,
        `GOLD (D-SI 2 identifiers, never with a prefix or exponent): ${line('gold', u => !!u.dsi2)}`,
        `SILVER (accepted for use with the SI): ${line('silver')}`,
        `BRONZE (8th SI brochure only): ${line('bronze')}`,
        `PREFIXES (any prefix makes the unit at best GOLD): ${DSI_PREFIXES.filter(p => !p.dsi2).map(p => `\\${p.id} (10^${p.pow})`).join(' ')}`,
    ].join('\n');
};

// ─────────────────────────────── Checking an answer of the AI ───────────────────────────────

/** Whitespace-free form for comparing unit texts. Case is kept: "mS" and "ms" are different units. */
const squash = (s: string) => normalizeHuman(s).replace(/\s+/g, '');
const words = (s: string) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/** What the context says when a symbol after the unit is the unit (K: a temperature, N: a force …). */
const UNIT_EVIDENCE: Record<string, RegExp> = {
    K: /\b(temperature|thermal|kelvin|heat|expansion)\b/i, N: /\b(force|newton|load|tension|thrust)\b/i, C: /\b(charge|coulomb|electric)\b/i,
    S: /\b(conductance|conductivity|siemens)\b/i, V: /\b(voltage|volt|potential|electric field)\b/i, W: /\b(power|watt|heat flow)\b/i,
    H: /\b(inductance|henry|magnetic)\b/i, F: /\b(capacitance|farad|permittivity)\b/i, P: /\b(viscosity|poise)\b/i,
};

/** Does the context name the element, so that "N" after the unit is nitrogen? */
const contextNamesElement = (symbol: string, contextTexts: string[]): boolean => {
    const name = ELEMENT_NAMES[symbol];
    if (name && contextTexts.some(t => name.test(String(t || '')))) return true;
    // The symbol as a word in the quantity's own name or description ("Total N", "K (potassium)")
    const re = new RegExp(`(^|[^A-Za-z])${symbol}([^A-Za-z]|$)`);
    return contextTexts.slice(0, 3).some(t => re.test(String(t || '')));
};

/**
 * Decides whether a D-SI unit suggested by the AI may be used for a unit of the certificate. It must
 * follow the D-SI rules and be exactly the unit as written: same size, same quantity, same named
 * units. The AI may leave out only what the rules themselves found to be notes (basis, analyte, kind)
 * and, when the context names the element, an element symbol after the unit ("mg/kg N"). It may never
 * leave out a number, a power of ten, a "/" or a unit symbol. A ppb or ‰ written as a fraction needs
 * the kind of fraction stated in words that really are in the certificate text.
 */
export const acceptAiUnit = (
    unitText: string,
    answer: { cleanUnit?: string; quantityKind?: string; evidence?: string; dsiUnit?: string },
    contextTexts: string[] = [],
): { ok: true; dsi: string; cls: DsiClass; kind?: RatioKind } | { ok: false; reason: string } => {
    const dsi = String(answer.dsiUnit ?? '').trim();
    if (!dsi) return { ok: false, reason: 'The AI found no D-SI unit of the same size.' };
    const c = checkDsi(dsi);
    if (!c.ok) return { ok: false, reason: `The AI's D-SI unit ${dsi} breaks the D-SI rules: ${issuesText(c.errors)}` };
    if (c.hasPer) return { ok: false, reason: `The AI used \\per; the generator writes division as a negative exponent, which keeps the better class (D-SI guide Section 3, p. 15).` };
    const a = analyzeUnit(unitText);
    if (a.notUnit) return { ok: false, reason: a.notUnit };
    const allowed = new Map<string, string>([[squash(unitText), unitText], [squash(a.core), a.core]]);
    if (a.ambiguous && contextNamesElement(a.ambiguous.token, contextTexts)) allowed.set(squash(a.ambiguous.coreWithout), a.ambiguous.coreWithout);
    const clean = String(answer.cleanUnit ?? '').trim() || String(unitText ?? '').trim();
    const chosen = allowed.get(squash(clean));
    if (chosen === undefined) {
        return { ok: false, reason: `The AI read the unit as "${clean}", but from "${unitText}" only notes about the basis, the analyte or the kind of fraction may be left out (they were: ${a.notes.length ? a.notes.map(n => `"${n.text}"`).join(', ') : 'none'}).` };
    }
    const chosenAnalysis = analyzeUnit(chosen);
    // The AI kept the symbol after the unit as a unit ("K" in "kg/(m³ K)"): only when the context is about
    // that unit's quantity (a temperature for K, a force for N …) and does not name the element
    const keepsAmbiguous = !!chosenAnalysis.ambiguous && !!chosenAnalysis.ambiguous.token;
    if (chosenAnalysis.ambiguous && !keepsAmbiguous) return { ok: false, reason: chosenAnalysis.ambiguous.reason };
    if (keepsAmbiguous) {
        const tok = chosenAnalysis.ambiguous!.token;
        const evidence = UNIT_EVIDENCE[tok];
        if (!evidence || !evidence.test(contextTexts.join(' ')) || contextNamesElement(tok, contextTexts)) {
            return { ok: false, reason: `"${tok}" after the unit was read as a unit, but the description of the quantity does not show that it is one (and not the element ${tok}).` };
        }
    }
    const read = keepsAmbiguous ? readCore(chosenAnalysis.core) : readCore(chosenAnalysis.core);
    let kind: RatioKind | undefined = a.kind;
    const h = read && read.h;
    if (h && h.tokens.length === 1 && h.tokens[0].def.ratio !== undefined && !h.tokens[0].def.dsi && !kind) {
        kind = kindsIn(String(answer.quantityKind ?? ''))[0];
        const evidence = words(String(answer.evidence ?? ''));
        const sources = [unitText, ...contextTexts].map(words);
        if (!kind || !evidence || !sources.some(src => src.includes(evidence)) || !kindsIn(evidence).includes(kind)) {
            return { ok: false, reason: `"${clean}" has no D-SI identifier, and the certificate text quoted by the AI does not state the kind of fraction.` };
        }
    }
    if (chosenAnalysis.core === 'C' && c.tokens.some(t => t.unit === 'degreecelsius') && !TEMPERATURE_WORDS.test(contextTexts.join(' '))) {
        return { ok: false, reason: '"C" was read as degree Celsius, but the certificate text around it is not about a temperature.' };
    }
    if (h && h.tokens.some(t => t.def.dsi === 'radian') && DOSE_WORDS.test(contextTexts.join(' ')) && c.tokens.some(t => t.unit === 'radian')) {
        return { ok: false, reason: '"rad" in a dose is not the radian.' };
    }
    const v = verifySameUnit(chosen, dsi, kind, { ambiguousAsUnit: keepsAmbiguous });
    if (!v.ok) return { ok: false, reason: v.reason };
    return { ok: true, dsi: formatDsi(c.tokens), cls: c.cls, kind };
};

/** ppb or ‰ on its own: its D-SI form depends on the kind of fraction, which the unit does not say. */
export const isKindDependent = (unitText: string): boolean => {
    const a = analyzeUnit(unitText);
    if (a.kind || a.notUnit || a.ambiguous || a.dimensionOne) return false;
    const h = parseCore(a.core);
    return !!h && h.tokens.length === 1 && h.tokens[0].def.ratio !== undefined && !h.tokens[0].def.dsi;
};

/** The unit symbols of a unit text read as a unit (notes about basis or analyte left out), or null. */
export const parseHumanUnit = (raw: string): HumanUnit | null => {
    const a = analyzeUnit(raw);
    if (a.notUnit || a.ambiguous) return null;
    if (a.dimensionOne) return parseCore('1');
    const r = readCore(a.core);
    return r.h;
};

/** Notes of a unit text that a D-SI unit cannot carry (basis, analyte, "as N", pH), for the validation report. */
export const unitTextNotes = (raw: string): UnitNote[] => analyzeUnit(raw).notes.filter(n => n.type !== 'kind');
