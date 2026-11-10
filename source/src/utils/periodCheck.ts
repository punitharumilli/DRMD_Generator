// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Reads the period of validity from the text of a certificate ("This certificate is valid for one
 * year from the date of shipment", "gültig für 24 Monate ab Versanddatum"), so that the period the
 * AI filled in can be checked against it, corrected when it disagrees, and marked in the PDF.
 */

const NUMBER_WORDS: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20,
    'twenty-four': 24, 'twenty four': 24, thirty: 30, 'thirty-six': 36, 'thirty six': 36, 'forty-eight': 48, 'forty eight': 48, sixty: 60,
    ein: 1, eine: 1, einem: 1, einen: 1, eines: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8,
    neun: 9, zehn: 10, elf: 11, 'zwölf': 12, achtzehn: 18, vierundzwanzig: 24, 'sechsunddreißig': 36,
    un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, dix: 10, douze: 12, 'dix-huit': 18, 'vingt-quatre': 24, 'trente-six': 36,
};
const NUMBER = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).map(w => w.replace(/[-\s]/g, '[-\\s]')).join('|')})`;
const YEAR = 'years?|yrs?|jahre?n?|jahres|ans?|ann[ée]es?';
const MONTH = 'months?|monate?n?|monats|mois';
const UNIT = `(${YEAR}|${MONTH})`;
// "one (1) year", "12-month", "24 months"
const AMOUNT = `(?<![\\p{L}\\d-])${NUMBER}(?:\\s*\\(\\s*[\\p{L}\\d-]{1,15}\\s*\\))?[\\s-]*${UNIT}(?![\\p{L}])`;
const AND_AMOUNT = `(?:\\s+(?:and|und|et)\\s+${NUMBER}[\\s-]*${UNIT}(?![\\p{L}]))?`;
const VALID_WORD = '(?:valid\\w*|validit\\w*|expir\\w*|g[üu]ltig\\w*|haltbar\\w*|shelf[\\s-]life|valable|péremption)';
const FROM_EVENT = '(?:\\s+(?:from|after|following|ab|nach|à\\s+compter\\s+de|après)\\s+(?:the\\s+|dem\\s+|der\\s+|la\\s+)?(?:date\\s+of\\s+)?(?:shipment|dispatch|delivery|purchase|receipt|versand\\w*|liefer\\w*|auslieferung\\w*|kauf\\w*|exp[ée]dition|livraison)(?:\\s*date)?)?';

// A period after opening ("use within 2 months after opening") is not the validity of the certificate.
const AFTER_OPENING = /^[^.;]{0,40}\b(opening|opened|open|geöffnet|öffnen|anbruch|ouverture)\b/i;

const amount = (word: string, unit: string): { years: number; months: number } => {
    const n = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word.toLowerCase().replace(/\s+/g, ' ')] ?? NUMBER_WORDS[word.toLowerCase().replace(/\s+/g, '-')] ?? 0;
    return new RegExp(`^(${YEAR})$`, 'i').test(unit) ? { years: n, months: 0 } : { years: 0, months: n };
};

export interface ValidityStatement {
    /** Total period in months. */
    months: number;
    /** The words of the PDF that state it, as printed. */
    text: string;
    /** Page (1-based) it is on; 0 when unknown. */
    page: number;
}

/** "P1Y", "P1Y6M", "P18M" from years and months (as the XML writes it). */
export const isoPeriod = (years: number, months: number): string => {
    const y = Math.max(0, Math.floor(years || 0)), m = Math.max(0, Math.floor(months || 0));
    if (!y && !m) return 'P0Y';
    return `P${y ? y + 'Y' : ''}${m ? m + 'M' : ''}`;
};
/** "1 year", "1 year and 6 months", "18 months". */
export const periodWords = (totalMonths: number): string => {
    const y = Math.floor(totalMonths / 12), m = totalMonths % 12;
    const ys = y ? `${y} year${y === 1 ? '' : 's'}` : '', ms = m ? `${m} month${m === 1 ? '' : 's'}` : '';
    return [ys, ms].filter(Boolean).join(' and ') || '0 months';
};

/** The statements of a period of validity in a text (one page, or the whole plain text). */
export const validityStatements = (text: string, page = 0): ValidityStatement[] => {
    const out: ValidityStatement[] = [];
    // The validity word nearest to the period starts the match (no other one in between).
    const re = new RegExp(`${VALID_WORD}(?:(?!${VALID_WORD})[^.;:]){0,120}?${AMOUNT}${AND_AMOUNT}${FROM_EVENT}|${AMOUNT}${AND_AMOUNT}\\s+(?:from|after|following|ab|nach)\\s+(?:the\\s+|dem\\s+|der\\s+)?(?:date\\s+of\\s+)?(?:shipment|dispatch|delivery|purchase|receipt|versand\\w*|liefer\\w*|auslieferung\\w*)(?:\\s*date)?`, 'giu');
    for (const m of text.matchAll(re)) {
        const [whole, n1, u1, n2, u2, n3, u3, n4, u4] = m;
        const rest = text.slice((m.index ?? 0) + whole.length);
        if (AFTER_OPENING.test(rest)) continue;
        const first = n1 ? amount(n1, u1) : amount(n3, u3);
        const second = n1 ? (n2 ? amount(n2, u2) : null) : (n4 ? amount(n4, u4) : null);
        const months = first.years * 12 + first.months + (second ? second.years * 12 + second.months : 0);
        if (months > 0 && months <= 1200) out.push({ months, text: whole.replace(/\s+/g, ' ').trim(), page });
    }
    return out;
};

export type PeriodCheck =
    | { result: 'matches'; statement: ValidityStatement }
    | { result: 'differs'; statement: ValidityStatement }
    | { result: 'unclear'; statements: ValidityStatement[] }
    | { result: 'none' };

/**
 * The period in the form, compared with the PDF: the statement that matches it, the one statement
 * that contradicts it, several statements that disagree among themselves, or none at all.
 */
export const checkPeriod = (totalMonths: number, statements: ValidityStatement[]): PeriodCheck => {
    if (!statements.length) return { result: 'none' };
    const same = statements.find(s => s.months === totalMonths);
    if (same) return { result: 'matches', statement: same };
    const distinct = Array.from(new Set(statements.map(s => s.months)));
    if (distinct.length === 1) return { result: 'differs', statement: statements[0] };
    return { result: 'unclear', statements };
};
