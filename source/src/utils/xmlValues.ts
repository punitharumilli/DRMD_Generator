// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Normalisers that turn the text a certificate (and the AI) uses into values the DRMD schema
 * accepts. Shared by the XML generator (to write valid XML) and the validator (to explain exactly
 * which value could not be written, and why). Each returns null when the input cannot be expressed
 * as a schema-valid value — callers decide whether that is an error or a fall-back to text.
 */

// Pattern of si:decimalType (D-SI), without the NaN branch: a producer should never emit NaN.
const DECIMAL = /^[-+]?((\d*\.\d+)|(\d+\.\d*)|(\d+\.?))([Ee][-+]?\d+)?$/;

const SUPERSCRIPT: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
};

/** How a number from the certificate was read. */
export interface NumberReading {
    /** The number as si:decimalType, or null when it is not a single number (or cannot be read safely). */
    value: string | null;
    /** Digit groups or thousands separators were removed ("100 000" → "100000"): worth a look. */
    grouped?: 'digit-groups' | 'thousands';
    /** "1,234": a decimal comma (1.234) or a thousands separator (1234)? Not decided, so not written as a number. */
    ambiguous?: boolean;
}

// Digit-group separators of the SI brochure (a space, thin space or narrow no-break space) and the apostrophe.
const GROUP_SEP = "[ \\u00A0\\u2009\\u202F'’]";
const GROUPED_INT = new RegExp(`^\\d{1,3}(?:${GROUP_SEP}\\d{3})+$`);
const GROUPED_FRAC = new RegExp(`^\\d{3}(?:${GROUP_SEP}\\d{3})*(?:${GROUP_SEP}\\d{1,3})?$|^\\d+$`);

/**
 * Reads one number as written in a certificate. "6.85" → "6.85"; "1.20 x 10⁹" → "1.20e9"; "0,85" → "0.85";
 * "100 000" and "0.000 12" (digit groups of the SI brochure, 9th ed., 5.4.4) → "100000", "0.00012";
 * "1,234.5" / "1.234,5" / "1,234,567" (thousands separators beside a decimal mark) → "1234.5", "1234.5",
 * "1234567". "1,234" and "12,345" are ambiguous (decimal comma or thousands separator) and are not read.
 * Limits ("< 2"), ranges ("6.5 - 7.0"), lists ("12 15 18") and text give null.
 */
export const readNumber = (raw: unknown): NumberReading => {
    if (raw === undefined || raw === null) return { value: null };
    let s = String(raw).trim();
    if (!s) return { value: null };
    s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, c => SUPERSCRIPT[c]).replace(/[−–]/g, '-');  // superscripts, unicode minus
    s = s.replace(/^([-+])\s+/, '$1');                                              // "- 5" → "-5"
    const finite = (out: string | null, extra: Omit<NumberReading, 'value'> = {}): NumberReading =>
        // "1e400" matches the pattern but is not a finite double (it would be written as Infinity)
        out !== null && Number.isFinite(Number(out)) ? { value: out, ...extra } : { value: null };
    // a × 10^b in its usual spellings
    const sci = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+))\s*[x×·*]\s*10\s*\^?\s*([-+]?\d+)$/i);
    if (sci) return finite(`${sci[1]}e${sci[2]}`);
    if (DECIMAL.test(s)) return finite(s);
    const sign = /^[-+]/.test(s) ? s[0] : '';
    const body = sign ? s.slice(1) : s;
    // Decimal comma: "0,85", "12,5", "1,2345". With exactly three digits after it and no leading zero
    // ("1,234", "12,345") it may as well be a thousands separator.
    if (/^\d+,\d+$/.test(body)) {
        if (/^[1-9]\d{0,2},\d{3}$/.test(body)) return { value: null, ambiguous: true };
        return finite(sign + body.replace(',', '.'));
    }
    // Thousands separators with the other decimal mark: "1,234.5", "1,234,567", "1.234,5", "1.234.567"
    let m = body.match(/^(\d{1,3}(?:,\d{3})+)(\.\d+)?$/);
    if (m && (m[2] || (m[1].match(/,/g) || []).length > 1)) return finite(sign + m[1].replace(/,/g, '') + (m[2] || ''), { grouped: 'thousands' });
    m = body.match(/^(\d{1,3}(?:\.\d{3})+)(,\d+)?$/);
    if (m && (m[2] || (m[1].match(/\./g) || []).length > 1)) return finite(sign + m[1].replace(/\./g, '') + (m[2] ? '.' + m[2].slice(1) : ''), { grouped: 'thousands' });
    // Digit groups: "100 000", "12 345.678 9", "0.000 12", "1 234,5", "1'234.5"
    const dec = body.match(/^([^.,]+)(?:([.,])(.+))?$/);
    if (dec && new RegExp(GROUP_SEP).test(body)) {
        const [, intPart, mark, frac] = dec;
        const intOk = GROUPED_INT.test(intPart) || /^\d+$/.test(intPart);
        const fracOk = frac === undefined || GROUPED_FRAC.test(frac);
        if (intOk && fracOk) {
            const strip = (x: string) => x.replace(new RegExp(GROUP_SEP, 'g'), '');
            return finite(sign + strip(intPart) + (mark ? '.' + strip(frac!) : ''), { grouped: 'digit-groups' });
        }
    }
    return { value: null };
};

/** The number as si:decimalType, or null (see readNumber). */
export const toDecimalString = (raw: unknown): string | null => readNumber(raw).value;

/** Uncertainty: like toDecimalString, but tolerates "± 0.6", "+/- 0.6", "U = 0.6"; must be ≥ 0. */
export const toUncertaintyString = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim().replace(/^(?:U\s*=\s*)?(?:±|\+\/-|\+-)\s*/i, '').replace(/^U\s*=\s*/i, '');
    const d = toDecimalString(s);
    if (d === null || d.startsWith('-')) return null;
    return d.replace(/^\+/, '');
};

/** Coverage factor k: "2", "k=2", "k = 2.0", "2.36" → si:kValueType (≥ 1, no leading zero). */
export const toCoverageFactor = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim().replace(/^k\s*=?\s*/i, '');
    const d = toDecimalString(s);
    if (d === null) return null;
    const n = Number(d);
    if (!Number.isFinite(n) || n < 1) return null;
    return /^\+?(([1-9]\d*\.\d*)|([1-9]\d*))$/.test(d) ? d.replace(/^\+/, '') : String(n);
};

/** Coverage probability: "0.95", "95", "95 %", "95%", "approximately 95 %" → "0.95" (si:probabilityValueType). */
export const toCoverageProbability = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null;
    let s = String(raw).trim().replace(/^(?:approx\.?|approximately|about|ca\.?|p\s*=?)\s*/i, '');
    const percent = /%\s*$/.test(s);
    s = s.replace(/\s*%\s*$/, '');
    const d = toDecimalString(s);
    if (d === null) return null;
    let n = Number(d);
    if (!Number.isFinite(n) || n < 0) return null;
    if (percent || n > 1) n = n / 100;
    if (n > 1) return null;
    return String(Number(n.toPrecision(10)));
};

const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const isRealDate = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= lastDayOfMonth(y, m);
const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * xs:date "YYYY-MM-DD". Accepts YYYY-MM-DD, DD.MM.YYYY, MM/YYYY and YYYY-MM (→ last day of month,
 * the convention the extraction prompt uses). DD/MM/YYYY vs MM/DD/YYYY is ambiguous: returns null.
 */
export const toXsdDate = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null;
    // xs:date may carry a time zone ("2051-09-30Z", "2051-09-30+01:00"); the date itself is kept.
    const s = String(raw).trim().replace(/^(\d{4}-\d{1,2}-\d{1,2})(?:Z|[+-]\d{2}:\d{2})$/, '$1');
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { const [y, mo, d] = [+m[1], +m[2], +m[3]]; return isRealDate(y, mo, d) ? `${pad(y, 4)}-${pad(mo)}-${pad(d)}` : null; }
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) { const [d, mo, y] = [+m[1], +m[2], +m[3]]; return isRealDate(y, mo, d) ? `${pad(y, 4)}-${pad(mo)}-${pad(d)}` : null; }
    m = s.match(/^(\d{1,2})\/(\d{4})$/) || s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
        const [y, mo] = s.includes('/') ? [+m[2], +m[1]] : [+m[1], +m[2]];
        return mo >= 1 && mo <= 12 ? `${pad(y, 4)}-${pad(mo)}-${pad(lastDayOfMonth(y, mo))}` : null;
    }
    return null;
};

/**
 * The first date written inside a longer text, as xs:date, or null. Used when the AI adds words
 * to a date ("2051-09-30 (end of month of 09/2051)"): the date it wrote first is kept.
 */
export const findDateInText = (raw: unknown): string | null => {
    const s = String(raw ?? '');
    const patterns = [/\d{4}-\d{1,2}-\d{1,2}(?!\d)/g, /\d{1,2}\.\d{1,2}\.\d{4}(?!\d)/g, /(?<![\d.])\d{1,2}\/\d{4}(?!\d)/g, /\d{4}-\d{1,2}(?![\d-])/g];
    let best: { at: number; date: string } | null = null;
    for (const re of patterns) {
        for (const m of s.matchAll(re)) {
            const date = toXsdDate(m[0]);
            if (date && (best === null || (m.index ?? 0) < best.at)) best = { at: m.index ?? 0, date };
        }
    }
    return best ? best.date : null;
};

// Country name → ISO 3166-1 alpha-2, built from the browser's own region names (no table to maintain).
// Codes the browser knows that are not countries (European Union, Eurozone, United Nations, Outlying
// Oceania, pseudo-locales, "Unknown Region") are left out.
const NOT_A_COUNTRY = new Set(['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ']);
// Two-letter codes that are common but are not the ISO 3166 code of the country.
const CODE_ALIASES: Record<string, string> = { UK: 'GB', EL: 'GR' };
let countryIndex: Map<string, string> | null = null;
let countryCodes: Set<string> | null = null; // empty when the browser cannot list region names
const buildCountryIndex = (): Map<string, string> => {
    const index = new Map<string, string>();
    countryCodes = new Set();
    try {
        const names = new (Intl as any).DisplayNames(['en'], { type: 'region' });
        for (let a = 65; a <= 90; a++) {
            for (let b = 65; b <= 90; b++) {
                const code = String.fromCharCode(a, b);
                if (NOT_A_COUNTRY.has(code)) continue;
                const name = names.of(code);
                if (name && name !== code) { index.set(name.toLowerCase(), code); countryCodes.add(code); }
            }
        }
    } catch { /* Intl.DisplayNames unavailable: only two-letter codes are accepted */ }
    // Common spellings DisplayNames does not use
    const extra: Record<string, string> = {
        'usa': 'US', 'united states of america': 'US', 'u.s.a.': 'US', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
        'the netherlands': 'NL', 'holland': 'NL', 'russian federation': 'RU', 'republic of korea': 'KR', 'south korea': 'KR',
        'czech republic': 'CZ', 'deutschland': 'DE', 'belgique': 'BE', 'belgië': 'BE', 'österreich': 'AT', 'schweiz': 'CH',
    };
    Object.entries(extra).forEach(([k, v]) => index.set(k, v));
    return index;
};

/** "DE" → "DE", "de" → "DE", "UK" → "GB", "Belgium" → "BE"; null when it is not a country (e.g. "EU", "XX"). */
export const toCountryCode = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (!countryIndex) countryIndex = buildCountryIndex();
    if (/^[A-Za-z]{2}$/.test(s)) {
        const code = CODE_ALIASES[s.toUpperCase()] || s.toUpperCase();
        if (NOT_A_COUNTRY.has(code)) return null;
        // Without the browser's region list, any other two letters are accepted as before.
        return !countryCodes || countryCodes.size === 0 || countryCodes.has(code) ? code : null;
    }
    return countryIndex.get(s.toLowerCase().replace(/\s+/g, ' ')) || null;
};

/** dcc:notEmptyStringType: no leading/trailing whitespace, not empty. */
export const notEmpty = (raw: unknown): string | null => {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    return s ? s : null;
};

/** The text the app writes into a field the AI could not fill (see extractionPipeline.ts). */
export const NOT_AVAILABLE_TEXT = "Information Not Available / Information not retrieved by AI";
export const isPlaceholderText = (raw: unknown): boolean =>
    typeof raw === 'string' && raw.trim() === NOT_AVAILABLE_TEXT;

/** minimumSampleSize / itemQuantities hold this literal when nothing was stated. */
export const isNoQuantityPlaceholder = (raw: unknown): boolean =>
    raw === undefined || raw === null || String(raw).trim() === '' || String(raw).trim().toLowerCase() === 'noquantity';
