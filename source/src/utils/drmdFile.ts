// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import { DRMD } from '../types';
import { parseDrmdXml } from './xmlParser';
import { buildDrmdXml, FORM_STATE_COMMENT } from './xmlGenerator';
import { formFromState } from './formState';

export interface ReadDrmd {
    doc: DRMD;
    /** The form was restored as it was saved (see formState.ts). */
    restored: boolean;
    /** The file holds a saved form, but its XML was changed afterwards: it opens as the XML says. */
    changedSinceSaved: boolean;
}

const sameText = (s: string) => s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/**
 * The comment the generator writes before the closing tag (xmlGenerator.ts): its JSON, and the file
 * without it. Found with indexOf, not a regular expression, so that a crafted file cannot make the
 * search slow. XML comments cannot contain "--", so the first "-->" ends it.
 */
const splitStateComment = (text: string): { json: string; rest: string } | null => {
    const open = `<!-- ${FORM_STATE_COMMENT}:`;
    const start = text.indexOf(open);
    if (start < 0) return null;
    const end = text.indexOf('-->', start + open.length);
    if (end < 0) return null;
    const body = text.slice(start + open.length, end);
    const data = body.indexOf('DATA:');
    if (data < 0) return null;
    // The generator puts the comment on its own line, indented by two spaces.
    const from = text.slice(start - 3, start) === '\n  ' ? start - 3 : start;
    return { json: body.slice(data + 5).trim(), rest: text.slice(0, from) + text.slice(end + 3) };
};

/**
 * Reads a DRMD XML file into the form. A file the generator saved holds the form as it was (see
 * formState.ts); that form is used when it gives exactly the XML of the file, so the file opens
 * again unchanged. Otherwise (another tool's file, an older version's, or a file changed after it
 * was saved) the form is read from the XML itself.
 */
export const readDrmdXml = (xmlText: string): ReadDrmd => {
    const fromXml = parseDrmdXml(xmlText);
    const text = sameText(xmlText);
    const parts = splitStateComment(text);
    if (!parts) return { doc: fromXml, restored: false, changedSinceSaved: false };
    let state: unknown = null;
    try { state = JSON.parse(parts.json); } catch { state = null; }
    const form = formFromState(state);
    if (!form) return { doc: fromXml, restored: false, changedSinceSaved: false };
    // The embedded files come from the XML; everything else from the saved form.
    const doc: DRMD = { ...form, binaryDocuments: fromXml.binaryDocuments };
    const again = sameText(buildDrmdXml(doc, { includeAnnotations: false }).xml);
    if (again !== parts.rest) return { doc: fromXml, restored: false, changedSinceSaved: true };
    return { doc, restored: true, changedSinceSaved: false };
};
