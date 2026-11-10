// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import { PdfTextIndex, Conversion, findSourcePassage, verifyNorm, isInPdf } from './valueCheck';
import { validityStatements, checkPeriod, isoPeriod, periodWords, PeriodCheck } from './periodCheck';

/**
 * What the certificate pane says about a value that is not in the PDF word for word: where it was
 * taken from (marked in the PDF), how the value differs from that text, and what to do. Built from
 * the PDF text alone, so it holds for values of the AI and for values typed by hand.
 */
export interface Explanation {
    /** converted: written in another form for machine readability; derived: put together from the
     *  marked text; differs: contradicts the marked text; notFound: no source in the PDF;
     *  generated: created by the generator, not taken from the PDF. */
    tone: 'converted' | 'derived' | 'differs' | 'notFound' | 'generated';
    title: string;
    /** The text of the PDF the value comes from (marked). */
    pdf?: string;
    /** The value as in the form. */
    form?: string;
    /** The value as written in the XML, when it is written differently. */
    xml?: string;
    notes: string[];
    /** Text to mark in the PDF, and its page (1-based). */
    mark?: { text: string; page: number };
}

const quote = (s: string) => `“${s}”`;
const quoteList = (words: string[]) => words.map(quote).join(', ');

export const CONVERTED_TITLE = 'Converted for machine readability';

export const fromConversion = (c: Conversion): Explanation => ({
    tone: 'converted', title: CONVERTED_TITLE, pdf: c.printed || undefined, xml: c.written, notes: [c.reason], mark: c.mark,
});

/** A value that is not in the PDF word for word: the passage it was most likely taken from, and how it differs. */
export const explainDerived = (value: string, index: PdfTextIndex, page?: number, byAi = true): Explanation => {
    const p = findSourcePassage(value, index, page);
    if (!p) {
        return {
            tone: 'notFound', title: 'Not found in the PDF', form: value,
            notes: [byAi
                ? 'No passage of the PDF has most of the words of this value, so the AI may have added it. Check it against the certificate, and correct or delete it.'
                : 'No passage of the PDF has most of the words of this value.'],
        };
    }
    const notes: string[] = [];
    if (p.missing.length) {
        const shown = p.missing.slice(0, 8);
        notes.push(`Not in the marked text: ${quoteList(shown)}${p.missing.length > shown.length ? ` and ${p.missing.length - shown.length} more` : ''}.`);
        const elsewhere = p.missing.filter(w => verifyNorm(w).length >= 4 && !p.nowhere.includes(w));
        if (elsewhere.length) notes.push(`${quoteList(elsewhere)} ${elsewhere.length === 1 ? 'is' : 'are'} in another place of the PDF.`);
        if (p.nowhere.length) notes.push(`${quoteList(p.nowhere)} ${p.nowhere.length === 1 ? 'is' : 'are'} nowhere in the PDF.`);
    } else {
        notes.push('It has the same words as the marked text, in another order or with other punctuation.');
    }
    notes.push(byAi
        ? 'The AI put this value together from the marked text: check that it says the same, and correct it if not.'
        : 'The marked text is the closest match in the PDF.');
    return { tone: 'derived', title: 'Not word for word in the PDF', pdf: p.text, form: value, notes, mark: { text: p.text, page: p.page } };
};

/** All statements of a period of validity in the PDF, page by page. */
export const pdfValidityStatements = (index: PdfTextIndex) => index.original.flatMap((t, i) => validityStatements(t, i + 1));

/** The period after dispatch of the form, against what the PDF says. */
export const explainPeriod = (years: number, months: number, index: PdfTextIndex, byAi = true): Explanation => {
    const total = Math.max(0, Math.floor(years || 0)) * 12 + Math.max(0, Math.floor(months || 0));
    const iso = isoPeriod(Math.floor(total / 12), total % 12);
    const check: PeriodCheck = checkPeriod(total, pdfValidityStatements(index));
    switch (check.result) {
        case 'matches':
            return {
                tone: 'converted', title: CONVERTED_TITLE, pdf: check.statement.text, xml: iso,
                notes: [`${periodWords(total)} after dispatch. A period is written in ISO 8601 (P1Y is 1 year, P18M is 18 months), so that software can read it.`],
                mark: { text: check.statement.text, page: check.statement.page },
            };
        case 'differs':
            return {
                tone: 'differs', title: 'Does not match the PDF', pdf: check.statement.text, form: `${periodWords(total)} (${iso})`,
                notes: [`The PDF says ${periodWords(check.statement.months)} (${isoPeriod(Math.floor(check.statement.months / 12), check.statement.months % 12)}). Correct the period, or check whether another statement of the certificate applies.`],
                mark: { text: check.statement.text, page: check.statement.page },
            };
        case 'unclear':
            return {
                tone: 'differs', title: 'The PDF states more than one period', pdf: check.statements.map(s => s.text).join(' / '), form: `${periodWords(total)} (${iso})`,
                notes: [`The PDF says ${Array.from(new Set(check.statements.map(s => periodWords(s.months)))).join(' and also ')}. Check which one is the validity of the certificate.`],
                mark: { text: check.statements[0].text, page: check.statements[0].page },
            };
        default:
            return {
                tone: 'notFound', title: 'Not found in the PDF', form: `${periodWords(total)} (${iso})`,
                notes: [byAi
                    ? 'The PDF has no statement of a period of validity that the rules can read (such as “valid for one year from the date of shipment”). Check the period against the certificate.'
                    : 'The PDF has no statement of a period of validity that the rules can read.'],
            };
    }
};

const UNTIL_REVOKED = /\b(?:valid\s+)?(?:until\s+(?:it\s+is\s+)?(?:revoked|withdrawn|further\s+notice)|bis\s+(?:auf|zum)\s+widerruf|unbefristet|jusqu['’]à\s+(?:révocation|nouvel\s+ordre))\b/i;

/** The validity type of the form, against what the PDF says. */
export const explainValidityType = (type: string, years: number, months: number, index: PdfTextIndex, byAi = true): Explanation | null => {
    if (type === 'Time After Dispatch') return explainPeriod(years, months, index, byAi);
    if (type === 'Until Revoked') {
        for (let i = 0; i < index.original.length; i++) {
            const m = index.original[i].match(UNTIL_REVOKED);
            if (m) return { tone: 'converted', title: CONVERTED_TITLE, pdf: m[0], xml: 'drmd:untilRevoked', notes: ['A certificate without an end of validity is written as the validity type Until Revoked.'], mark: { text: m[0], page: i + 1 } };
        }
        const periods = pdfValidityStatements(index);
        return {
            tone: periods.length ? 'differs' : 'notFound', title: periods.length ? 'Does not match the PDF' : 'Not found in the PDF', form: 'Until Revoked',
            pdf: periods[0]?.text, mark: periods[0] ? { text: periods[0].text, page: periods[0].page } : undefined,
            notes: [periods.length
                ? `The PDF gives a period of validity (${periodWords(periods[0].months)}), so the validity type is probably Time After Dispatch. Check it.`
                : 'The PDF does not say that the certificate is valid until revoked. Check the period of validity against the certificate.'],
        };
    }
    return null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The unique identifier: a UUID the generator created, when the PDF has none. */
export const explainIdentifier = (value: string, index: PdfTextIndex): Explanation | null => {
    if (!UUID.test(value.trim()) || isInPdf(value, index)) return null;
    return {
        tone: 'generated', title: 'Created by the generator', form: value,
        notes: ['The PDF gives no unique identifier for this document, so the generator created a UUID: every DRMD needs one (drmd:uniqueIdentifier). Keep it, or enter the identifier your organisation uses.'],
    };
};
