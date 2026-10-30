// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Links that come from data (an imported XML file, an AI answer, a look-up) are only used when they
 * are ordinary web addresses. Anything else, such as "javascript:" or "data:" links, is dropped, so a
 * crafted file cannot turn a link into code.
 */
export const safeHttpUrl = (value?: string | null): string => {
    const s = (value || '').trim();
    if (!s) return '';
    try {
        const url = new URL(s);
        return url.protocol === 'https:' || url.protocol === 'http:' ? s : '';
    } catch {
        return '';
    }
};
