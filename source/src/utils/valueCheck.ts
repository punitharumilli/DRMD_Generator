// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import { toCoverageProbability, toDecimalString, toUncertaintyString } from './xmlValues';
import { countryNames, conversionReason } from './sourceForms';
import { checkDsi } from './dsi';
import { validityStatements, isoPeriod, periodWords } from './periodCheck';

/**
 * Checking the values the AI filled in against the text of the PDF.
 *
 * A value counts as "in the PDF" when it appears there word for word, ignoring case, spacing and
 * punctuation ("BCR-017" matches "BCR® – 017"). Anything else was derived by the model and is
 * marked for the user to verify.
 *
 * Some values are written in another form on purpose, because the XML must be machine-readable: a
 * coverage probability of 95 % is written as 0.95, a decimal comma as a decimal point, a country as
 * its two-letter code, a unit in D-SI. Such a value is not marked when its printed form is in the
 * PDF: it was converted, not invented. `conversionOf` finds that printed form, so that the viewer
 * can mark it and say what it was converted into.
 */

export interface PdfTextIndex {
    /** All text, normalised, with a decimal point for a decimal comma. */
    joined: string;
    /** All text, normalised, numbers as printed (decimal commas kept). */
    printed: string;
    tokens: Set<string>;
    /** The lowercased text of each page, words separated by one space. */
    pages: string[];
    /** The text of each page as printed (case kept), words separated by one space. */
    original: string[];
    hasText: boolean;
}

export const verifyNorm = (s: string) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.,%]/g, '');
// A decimal comma and a decimal point are the same number: the generator writes "4.7" where a
// German certificate prints "4,7". Applied to the PDF text and to the value alike.
export const decimalPoint = (s: string) => s.replace(/(\d),(?=\d)/g, '$1.');

export const buildPdfTextIndex = (pageTexts: string[]): PdfTextIndex => {
    const spaced = pageTexts.join(' ');
    const printed = verifyNorm(spaced);
    const joined = decimalPoint(printed);
    const tokens = new Set<string>();
    for (const t of spaced.split(/\s+/)) {
        const n = verifyNorm(t);
        if (!n) continue;
        tokens.add(n);
        tokens.add(decimalPoint(n));
        // A number with a footnote mark or punctuation glued on ("4.7¹" is "4.71" after
        // normalising, "4.7," "4.7)") also counts as the number itself.
        const num = t.match(/^[<>≤≥~±]?(\d+(?:[.,]\d+)?)[^\d]*$/);
        if (num) tokens.add(decimalPoint(num[1]));
    }
    // Scanned certificates have no text layer: nothing can be checked automatically.
    return { joined, printed, tokens, pages: pageTexts.map(p => String(p || '').toLowerCase()), original: pageTexts.map(p => String(p || '')), hasText: joined.length > 200 };
};

// Footnote or list markers a value may start with ("2) half-width …", "a) …", "• …").
const LEADING_MARKER = /^\s*(?:\(?[0-9a-z]{1,2}\)|[0-9]{1,2}\.(?=\s)|[*•\-–])\s*/i;

export const isInPdf = (text: string, index: PdfTextIndex): boolean => {
    const v = decimalPoint(verifyNorm(String(text).replace(LEADING_MARKER, '')));
    if (!v) return true;
    if (v.length <= 3) return index.tokens.has(v) || index.tokens.has(v.replace(/[.,%]+$/, ''));
    if (index.joined.includes(v)) return true;
    // A longer text that strings together several sentences of the PDF still counts as found.
    const parts = String(text).split(/[;:\n]+|\.\s+/).map(p => decimalPoint(verifyNorm(p))).filter(p => p.length >= 12);
    return parts.length > 1 && parts.every(p => index.joined.includes(p));
};

/** The field a value is in, where it decides which conversions apply. */
export type ValueKind = 'probability' | 'number' | 'country' | 'unit' | 'period' | 'phone';

export interface Conversion {
    /** The value as the PDF prints it (empty when only the kind of conversion is known). */
    printed: string;
    /** The value as the XML writes it. */
    written: string;
    /** Why it is written so. */
    reason: string;
    /** Text to mark in the PDF, and the page it was found on (1-based). */
    mark?: { text: string; page: number };
}

export const PROBABILITY_REASON = 'A coverage probability is written as a number between 0 and 1 (si:coverageProbability), so that software can read it.';
export const NUMBER_REASON = 'Numbers are written with a decimal point and without spaces or separators between the digits (D-SI rule R003), so that software can read them.';
export const PERIOD_REASON = 'A period is written in ISO 8601 (P1Y is 1 year, P18M is 18 months), so that software can read it.';
export const PHONE_REASON = 'Phone numbers are written in international form: the country code replaces the leading 0, so that the number works from any country.';
export const DSI_UNIT_REASON = 'Units are written in D-SI, the unit format of the DRMD XML, so that software can read them. The value itself is not changed.';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The first place where `re` matches the text of a page, the given page first. Returns the match
 * with up to `before` words in front of it, so that a short match ("95 %") can be marked in the PDF
 * as a phrase that occurs only once ("of about 95 %").
 */
const findOnPages = (index: PdfTextIndex, re: RegExp, page?: number, before = 3): { text: string; match: string; page: number } | null => {
    const order = index.pages.map((_, i) => i);
    if (page && page >= 1 && page <= index.pages.length) { order.splice(page - 1, 1); order.unshift(page - 1); }
    for (const i of order) {
        const text = index.pages[i];
        const m = re.exec(text);
        if (!m) continue;
        const head = text.slice(0, m.index).split(/\s+/).filter(Boolean).slice(-before);
        return { text: [...head, m[0]].join(' ').trim(), match: m[0].trim(), page: i + 1 };
    }
    return null;
};

/** "0.95" → 95, "0.9973" → 99.73: the percentage a probability is printed as. */
const percentOf = (p: string): string => String(Number((Number(p) * 100).toPrecision(10)));

/**
 * The printed form of a value that is written differently in the XML for machine readability, when
 * that form is in the PDF. `page`: the page the value is expected on (its table), searched first.
 * Null when the value is not such a conversion, or when its printed form is not in the PDF either.
 */
export const conversionOf = (raw: unknown, kind: ValueKind, index: PdfTextIndex | null, page?: number): Conversion | null => {
    const value = String(raw ?? '').trim();
    if (!value || !index || !index.hasText) return null;
    // The form asks for the same values on every render: each is searched once per PDF.
    let cache = conversionCache.get(index);
    if (!cache) { cache = new Map(); conversionCache.set(index, cache); }
    const key = `${kind}|${page ?? ''}|${value}`;
    if (cache.has(key)) return cache.get(key)!;
    const found = findConversion(value, kind, index, page);
    if (cache.size > 5000) cache.clear();
    cache.set(key, found);
    return found;
};
const conversionCache = new WeakMap<PdfTextIndex, Map<string, Conversion | null>>();

const findConversion = (value: string, kind: ValueKind, index: PdfTextIndex, page?: number): Conversion | null => {
    if (kind === 'probability') {
        const p = toCoverageProbability(value);
        if (p === null) return null;
        // Printed as written in the XML ("P = 0.95"): nothing was converted.
        if (value === p && index.tokens.has(p)) return null;
        const pct = percentOf(p);
        const num = escapeRe(pct).replace('\\.', '[.,]');
        const re = new RegExp(`(?<![\\d.,])${num}(?:[.,]0+)?\\s*(?:%|per\\s?cent\\b|prozent\\b|pour\\s?cent\\b)`, 'i');
        const hit = findOnPages(index, re, page);
        if (!hit) return null;
        return { printed: hit.match.replace(/\s*%$/, ' %'), written: p, reason: PROBABILITY_REASON, mark: { text: hit.text, page: hit.page } };
    }
    if (kind === 'number') {
        const written = toDecimalString(value) ?? toUncertaintyString(value);
        if (written === null) return null;
        // The PDF prints the number with a decimal comma or digit groups ("0,028", "100 000").
        const digits = written.replace(/^[-+]/, '');
        const [int, frac] = digits.split('.');
        const intRe = int.length > 3 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s.,  ]?') : int;
        const re = new RegExp(`(?<![\\d.,])${intRe}${frac !== undefined ? `[.,]${frac}` : ''}(?![\\d]|[.,]\\d)`);
        const hit = findOnPages(index, re, page, 0);
        if (!hit) return null;
        if (hit.match === written) return null; // the PDF prints it as the XML writes it
        return { printed: hit.match, written, reason: NUMBER_REASON, mark: { text: hit.match, page: hit.page } };
    }
    if (kind === 'country') {
        const code = value.toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return null;
        for (const name of countryNames(code)) {
            // (Names in other scripts are empty once normalised: they cannot be compared.)
            if (verifyNorm(name).length < 4 || !isInPdf(name, index)) continue;
            const hit = findOnPages(index, new RegExp(`(?<![a-z])${escapeRe(name.toLowerCase())}(?![a-z])`), page, 0);
            return { printed: name, written: code, reason: conversionReason('country'), mark: hit ? { text: hit.match, page: hit.page } : undefined };
        }
        return null;
    }
    if (kind === 'period') {
        const m = value.match(/^P(?:(\d+)Y)?(?:(\d+)M)?$/);
        if (!m || (!m[1] && !m[2])) return null;
        const months = Number(m[1] || 0) * 12 + Number(m[2] || 0);
        const order = index.original.map((_, i) => i);
        if (page && page >= 1 && page <= order.length) { order.splice(page - 1, 1); order.unshift(page - 1); }
        for (const i of order) {
            const s = validityStatements(index.original[i], i + 1).find(st => st.months === months);
            if (s) return { printed: s.text, written: isoPeriod(Math.floor(months / 12), months % 12), reason: `${periodWords(months)}. ${PERIOD_REASON}`, mark: { text: s.text, page: s.page } };
        }
        return null;
    }
    if (kind === 'phone') {
        const digits = value.replace(/\D/g, '');
        if (digits.length < 6) return null;
        const order = index.original.map((_, i) => i);
        if (page && page >= 1 && page <= order.length) { order.splice(page - 1, 1); order.unshift(page - 1); }
        for (const i of order) {
            for (const m of index.original[i].matchAll(/\+?\(?\d[\d\s().\/-]{5,}\d/g)) {
                const d = m[0].replace(/\D/g, '');
                if (d === digits) return null; // printed with the same digits
                const national = d.replace(/^0+/, '');
                const extra = digits.length - national.length;
                if (national.length >= 6 && digits.endsWith(national) && extra >= 1 && extra <= 3 && d.startsWith('0'))
                    return { printed: m[0].trim(), written: value, reason: PHONE_REASON, mark: { text: m[0].trim(), page: i + 1 } };
            }
        }
        return null;
    }
    if (kind === 'unit') {
        // A D-SI unit in the unit column (a file saved by an earlier version keeps only the D-SI form).
        if (!value.startsWith('\\') || !checkDsi(value).ok) return null;
        return { printed: '', written: value, reason: DSI_UNIT_REASON };
    }
    return null;
};

/** True when a value is in the PDF word for word, or in the printed form it was converted from. */
export const isFoundInPdf = (text: string, index: PdfTextIndex, value?: string, kind?: ValueKind): boolean =>
    isInPdf(text, index) || (!!kind && conversionOf(value ?? text, kind, index) !== null);

// ---- Keys of values, for the list of values the AI filled in and the user verified ----
// A short hash of the normalised value: the list is saved with the document (see formState.ts),
// and the values themselves are in the document already.
const cyrb53 = (str: string, seed = 0): number => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};
/** The key of a value: equal for values that differ only in case, spacing or punctuation. Empty for an empty value. */
export const valueKey = (value: unknown): string => {
    const n = verifyNorm(String(value ?? '').trim());
    return n ? cyrb53(n).toString(36) : '';
};
export const VALUE_KEY = /^[0-9a-z]{1,12}$/;

// ---- Where a value that is not in the PDF word for word was taken from ----

export interface SourcePassage {
    /** The passage of the PDF, as printed, from the first to the last word it shares with the value. */
    text: string;
    page: number;
    /** Words of the value that are not in the passage, as written in the value. */
    missing: string[];
    /** Of those, the words (4 letters or more) that are nowhere in the PDF. */
    nowhere: string[];
    /** Share of the value's words (weighted) found in the passage, 0 to 1. */
    share: number;
}

const WORD = /[\p{L}\p{N}]+(?:[.,'’][\p{L}\p{N}]+)*/gu;
const STOP_WORDS = new Set(('the of and in on at to for a an is are be by with or as from this that it its which was were has have '
    + 'der die das und in im am an zu für ein eine ist sind von mit oder als aus den dem des bei auf '
    + 'le la les et de du des un une est sont en pour par avec ou au aux').split(' '));
const MAX_GAP = 8;
const weightOf = (w: string) => (/^\d/.test(w) ? 1.5 : STOP_WORDS.has(w) ? 0.25 : w.length <= 2 ? 0.5 : 1);
const normWord = (w: string) => decimalPoint(verifyNorm(w));

/**
 * The passage of the PDF that a value was most likely taken from: the shortest stretch of a page
 * that holds the largest share of the value's words. Used to mark where a value that is not in the
 * PDF word for word comes from, and to say which of its words the passage does not have.
 * Null when less than half of the value's words are in any one passage.
 */
export const findSourcePassage = (rawValue: unknown, index: PdfTextIndex | null, page?: number): SourcePassage | null => {
    const value = String(rawValue ?? '').trim();
    if (!value || !index || !index.hasText) return null;
    const valueWords = Array.from(value.matchAll(WORD)).map(m => ({ shown: m[0], norm: normWord(m[0]) })).filter(w => w.norm);
    const distinct = new Map<string, number>();
    for (const w of valueWords) distinct.set(w.norm, weightOf(w.norm));
    const total = Array.from(distinct.values()).reduce((a, b) => a + b, 0);
    if (!distinct.size || total === 0) return null;
    const maxSpan = Math.max(distinct.size * 2, distinct.size + 12);
    let best: { score: number; span: number; page: number; lo: number; hi: number; tokens: { norm: string; start: number; end: number }[]; words: Set<string> } | null = null;
    const order = index.original.map((_, i) => i);
    if (page && page >= 1 && page <= order.length) { order.splice(page - 1, 1); order.unshift(page - 1); }
    // A value of one sentence is taken from one sentence of the PDF.
    const oneSentence = !/[.!?;:]\s+\S/.test(value);
    for (const p of order) {
        const text = index.original[p];
        const ends = Array.from(text.matchAll(/[.!?;:]\s+(?=[\p{Lu}\d“"(])/gu)).map(m => m.index ?? 0);
        let e = 0;
        const tokens = Array.from(text.matchAll(WORD)).map(m => {
            const start = m.index ?? 0;
            while (e < ends.length && ends[e] < start) e++;
            return { norm: normWord(m[0]), start, end: start + m[0].length, sentence: e };
        });
        const hits = tokens.map((t, i) => ({ i, t })).filter(h => distinct.has(h.t.norm));
        // Two pointers over the words of the page that are words of the value.
        const count = new Map<string, number>();
        let score = 0, lo = 0;
        for (let hi = 0; hi < hits.length; hi++) {
            // A passage is one stretch of text: more than a few other words between two words of
            // the value start a new one (so "1" of a street number far away is not pulled in).
            if (hi > lo && (hits[hi].i - hits[hi - 1].i > MAX_GAP + 1 || (oneSentence && hits[hi].t.sentence !== hits[hi - 1].t.sentence))) { count.clear(); score = 0; lo = hi; }
            const w = hits[hi].t.norm;
            count.set(w, (count.get(w) || 0) + 1);
            if (count.get(w) === 1) score += distinct.get(w)!;
            while (hits[hi].i - hits[lo].i > maxSpan) {
                const lw = hits[lo].t.norm;
                count.set(lw, count.get(lw)! - 1);
                if (count.get(lw) === 0) score -= distinct.get(lw)!;
                lo++;
            }
            // Leading words that occur again inside the window add nothing.
            while (lo < hi && count.get(hits[lo].t.norm)! > 1) { count.set(hits[lo].t.norm, count.get(hits[lo].t.norm)! - 1); lo++; }
            const span = hits[hi].i - hits[lo].i;
            // The page asked for first, and a later page only when it holds clearly more.
            if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && span < best.span && p === best.page)) {
                best = { score, span, page: p, lo: hits[lo].i, hi: hits[hi].i, tokens, words: new Set(Array.from(count.entries()).filter(([, c]) => c > 0).map(([k]) => k)) };
            }
        }
    }
    if (!best || best.score / total < 0.5 || best.words.size < Math.min(2, distinct.size)) return null;
    // Words of the value right before or after the passage belong to it ("National Institute of"
    // at the start of a name whose words occur again further on).
    const t = best.tokens;
    let from = best.lo, to = best.hi;
    let j = from - 1;
    while (j >= 0 && distinct.has(t[j].norm)) j--;
    for (let k = j + 1; k < from; k++) if (!STOP_WORDS.has(t[k].norm)) { from = k; break; }
    j = to + 1;
    while (j < t.length && distinct.has(t[j].norm)) j++;
    for (let k = j - 1; k > to; k--) if (!STOP_WORDS.has(t[k].norm)) { to = k; break; }
    const seen = new Set<string>();
    const missing = valueWords.filter(w => !best!.words.has(w.norm) && !seen.has(w.norm) && seen.add(w.norm)).map(w => w.shown);
    // Nowhere in the PDF: not one of its words (and, for longer words, not part of one either).
    const nowhere = missing.filter(w => { const n = normWord(w); return n.length >= 2 && !/^\d+$/.test(n) && !index.tokens.has(n) && (n.length < 4 || !index.joined.includes(n)); });
    return {
        text: index.original[best.page].slice(t[from].start, t[to].end).replace(/\s+/g, ' ').trim(),
        page: best.page + 1, missing, nowhere, share: best.score / total,
    };
};
