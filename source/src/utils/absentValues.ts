// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Information that is not in the PDF stays empty.
 *
 * A model sometimes writes "Not specified", "N/A" or "-" where the certificate says nothing. Such a
 * value is not information: it would end up in the XML and the HTML report as if the certificate said
 * it. So it is removed, and the field stays empty. An empty optional field is left out of the XML; an
 * empty mandatory one is reported by the validation, for the user to fill in.
 *
 * "N/A" and "n/a" count in any case, and "NA" or "na" when written in one case. The mixed forms are
 * real values and stay: "nA" is the nanoampere and "Na" is sodium, as in a unit column or in a table
 * of elements.
 */

const ABSENT_VALUE = /^(?:n\/a|none|nil|unknown|-+|–|—|\?|(?:information\s+)?not\s+(?:specified|stated|available|given|provided|found|mentioned|reported|indicated|listed|retrieved)(?:\s+in\s+the\s+(?:certificate|document|pdf))?\.?)$/i;
// Case sensitive on purpose: "nA" and "Na" do not match.
const ABSENT_NA = /^(?:NA|na)$/;

/** True when the text only says that a value is missing ("N/A", "Not specified", "-"). */
export const isAbsentValue = (text: string): boolean => {
    const t = text.trim();
    return ABSENT_VALUE.test(t) || ABSENT_NA.test(t);
};

// Positions in the PDF, the texts as printed and the model's reasoning are kept as they are.
const SKIP_KEYS = new Set(['fieldCoordinates', 'sectionCoordinates', 'originalTexts', 'coverageReasoning']);

/** The answer of the model with every value that only says "missing" made empty. */
export const withoutAbsentValues = (value: any): any => {
    if (typeof value === 'string') return isAbsentValue(value) ? '' : value;
    if (Array.isArray(value)) return value.map(withoutAbsentValues);
    if (value && typeof value === 'object') {
        const out: any = {};
        for (const [k, v] of Object.entries(value)) out[k] = SKIP_KEYS.has(k) ? v : withoutAbsentValues(v);
        return out;
    }
    return value;
};
