// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Other ways a value can be written in a certificate. The XML needs machine-readable forms (a date
 * as 2020-06-01, a country as US), while the PDF says "01 June 2020" or "Gaithersburg, MD 20899".
 * To show the user where such a value came from, the viewer searches the PDF for these forms when
 * the value itself is not there word for word.
 */

const MONTHS: Record<string, string[]> = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    it: ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
};

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test((v || '').trim());

/** "2020-06-01" → "01 June 2020", "June 1, 2020", "1. Juni 2020", "01.06.2020", … (most specific first). */
export const dateForms = (iso: string): string[] => {
    const m = (iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return [];
    const [, y, mm, dd] = m;
    const mi = Number(mm) - 1, d = Number(dd);
    if (mi < 0 || mi > 11 || d < 1 || d > 31) return [];
    const out: string[] = [];
    const en = MONTHS.en[mi], enShort = en.slice(0, 3);
    for (const day of [dd, String(d)]) {
        out.push(`${day} ${en} ${y}`, `${en} ${day}, ${y}`, `${en} ${day} ${y}`, `${day} ${enShort} ${y}`, `${enShort} ${day}, ${y}`, `${day}-${enShort}-${y}`);
        out.push(`${day}. ${MONTHS.de[mi]} ${y}`, `${day} ${MONTHS.de[mi]} ${y}`);
        out.push(`${day} ${MONTHS.fr[mi]} ${y}`, `${day} de ${MONTHS.es[mi]} de ${y}`, `${day} ${MONTHS.it[mi]} ${y}`);
    }
    if (d === 1) out.push(`1er ${MONTHS.fr[mi]} ${y}`, `1st ${en} ${y}`, `${en} 1st, ${y}`);
    // Numbers: day.month.year (Europe) before month/day/year (US), then the rest.
    out.push(`${dd}.${mm}.${y}`, `${d}.${mi + 1}.${y}`, `${dd}/${mm}/${y}`, `${mm}/${dd}/${y}`, `${d}/${mi + 1}/${y}`, `${mi + 1}/${d}/${y}`,
        `${y}/${mm}/${dd}`, `${y}.${mm}.${dd}`, `${dd}-${mm}-${y}`);
    // A month without a day is written as its last day (the extraction rule "05/2048" → "2048-05-31").
    const lastDay = new Date(Date.UTC(Number(y), mi + 1, 0)).getUTCDate();
    if (d === lastDay) out.push(`${en} ${y}`, `${MONTHS.de[mi]} ${y}`, `${mm}/${y}`, `${mi + 1}/${y}`, `${mm}.${y}`, `${mm}-${y}`);
    return Array.from(new Set(out));
};

// Common other names that Intl.DisplayNames does not give.
const COUNTRY_EXTRA: Record<string, string[]> = {
    // Not "U.S." / "U.K.": certificates use them mostly as adjectives ("U.S. Government Printing Office").
    US: ['USA', 'U.S.A.', 'United States of America'],
    GB: ['UK', 'Great Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
    DE: ['Federal Republic of Germany', 'Bundesrepublik Deutschland'],
    NL: ['The Netherlands', 'Holland'],
    KR: ['Republic of Korea', 'Korea'],
    CN: ["People's Republic of China", 'P.R. China', 'PR China'],
    CZ: ['Czech Republic'],
    RU: ['Russian Federation'],
    CH: ['Suisse', 'Svizzera'],
};

/** "US" → "United States", "USA", "Vereinigte Staaten", … */
export const countryNames = (code: string): string[] => {
    const cc = (code || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return [];
    const out = new Set<string>(COUNTRY_EXTRA[cc] || []);
    for (const lang of ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'ja', 'zh', 'ko']) {
        try {
            const name = new (Intl as any).DisplayNames([lang], { type: 'region' }).of(cc);
            if (name && name !== cc) out.add(name);
        } catch { /* language not available */ }
    }
    return Array.from(out).sort((a, b) => b.length - a.length);
};

/**
 * Where a country code can be read from: the country's name, else the address it was derived from
 * (the city with its postcode, then the city alone).
 */
export const countryForms = (code: string, address?: { city?: string; postCode?: string }): string[] => {
    const forms = countryNames(code);
    const city = (address?.city || '').trim();
    const post = (address?.postCode || '').trim();
    if (city && post) forms.push(`${city}, ${post}`, `${post} ${city}`, `${city} ${post}`);
    if (city) forms.push(city);
    return Array.from(new Set(forms.filter(Boolean)));
};

/**
 * Where an address part the model added (a street missing from the certificate) comes from: the
 * address lines that are in the PDF (city with postcode, the city), else the organisation's name.
 */
export const addressForms = (address?: { city?: string; postCode?: string }, name?: string, line?: string): string[] => {
    // The address line the country was read from ("Gaithersburg, MD 20899"), when known.
    const forms = line && /\d/.test(line) ? [line.trim()] : [];
    forms.push(...countryForms('', address));
    if (name && name.trim()) forms.push(name.trim());
    return Array.from(new Set(forms));
};

/** What kind of value is shown in the PDF: it decides how its other forms are searched and explained. */
export type SourceKind = 'date' | 'country' | 'address';

/** Why a value is written differently in the XML, for the notice shown with the marked source. */
export const conversionReason = (kind?: SourceKind): string =>
    kind === 'date' ? 'Dates are written as YYYY-MM-DD (ISO 8601), so that software can read them.'
    : kind === 'country' ? 'Countries are written as two-letter codes (ISO 3166-1), so that software can read them.'
    : 'The XML needs this form, so that software can read it.';
