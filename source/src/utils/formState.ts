// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import {
    DRMD, Identifier, Producer, ResponsiblePerson, Material, MaterialProperty, MeasurementResult, Quantity,
    CustomStatement, ReviewState, ReviewCorrection, Comment, AdditionalDocument,
} from '../types';
import { safeHttpUrl } from './safeUrl';
import { VALUE_KEY } from './valueCheck';

/*
 * The form as it was saved, kept in a comment of the XML file, so that the file opens again exactly
 * as it was: the units as printed in the PDF (the XML has only their D-SI form), an uncertainty that
 * still lacks k or P (the XML cannot hold it yet), a second producer, the PDF positions of the
 * values, and which values the AI filled in and which of them the user has verified.
 *
 * The comment is only used when it describes the XML it is in: the form it holds must give exactly
 * the same XML again (see drmdFile.ts). A file changed by other software opens as its XML says.
 *
 * `formOf` copies only the known fields, with their types checked, both for writing and for reading
 * a file: a crafted comment cannot add other properties, code or links that are not web addresses.
 */

export const FORM_STATE_VERSION = 2;

const MAX_TEXT = 200_000;
const MAX_ITEMS = 20_000;
type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {});
const str = (v: unknown): string =>
    typeof v === 'string' ? (v.length > MAX_TEXT ? v.slice(0, MAX_TEXT) : v)
    : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
const optStr = (v: unknown): string | undefined => (typeof v === 'string' || typeof v === 'number' ? str(v) : undefined);
const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : 0;
    return Number.isFinite(n) ? n : 0;
};
const bool = (v: unknown): boolean => v === true;
const list = <T>(v: unknown, each: (x: unknown) => T): T[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS).map(each) : []);

// Names of fields in the coordinate and original-text maps ("countryCode", "minimumSampleSize").
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const RESERVED = new Set(['constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']);
const fieldMap = <T>(v: unknown, each: (x: unknown) => T | undefined): Record<string, T> | undefined => {
    const src = obj(v);
    const out: Record<string, T> = {};
    for (const key of Object.keys(src).slice(0, 200)) {
        if (!FIELD_NAME.test(key) || RESERVED.has(key)) continue;
        const val = each(src[key]);
        if (val !== undefined) out[key] = val;
    }
    return Object.keys(out).length ? out : undefined;
};
const box = (v: unknown): number[] | undefined =>
    Array.isArray(v) && v.length === 5 && v.every(n => typeof n === 'number' && Number.isFinite(n)) ? v.slice() as number[] : undefined;

/** Coordinates and PDF wording of an entity (HasCoordinates), only those it has. */
const coords = (o: Obj) => {
    const out: { fieldCoordinates?: Record<string, number[]>; sectionCoordinates?: number[]; originalTexts?: Record<string, string> } = {};
    const fc = fieldMap(o.fieldCoordinates, box);
    const sc = box(o.sectionCoordinates);
    const ot = fieldMap(o.originalTexts, x => (typeof x === 'string' ? str(x) : undefined));
    if (fc) out.fieldCoordinates = fc;
    if (sc) out.sectionCoordinates = sc;
    if (ot) out.originalTexts = ot;
    return out;
};

const identifier = (v: unknown): Identifier => {
    const o = obj(v);
    return { scheme: str(o.scheme), value: str(o.value), link: safeHttpUrl(str(o.link)) };
};

const producer = (v: unknown): Producer => {
    const o = obj(v), a = obj(o.address);
    return {
        uuid: str(o.uuid), name: str(o.name), email: str(o.email), phone: str(o.phone), fax: str(o.fax),
        address: { street: str(a.street), streetNo: str(a.streetNo), postCode: str(a.postCode), city: str(a.city), countryCode: str(a.countryCode) },
        organizationIdentifiers: list(o.organizationIdentifiers, identifier),
        ...coords(o),
    };
};

const person = (v: unknown): ResponsiblePerson => {
    const o = obj(v);
    return {
        uuid: str(o.uuid), name: str(o.name), role: str(o.role), description: str(o.description),
        mainSigner: bool(o.mainSigner), cryptElectronicSeal: bool(o.cryptElectronicSeal),
        cryptElectronicSignature: bool(o.cryptElectronicSignature), cryptElectronicTimeStamp: bool(o.cryptElectronicTimeStamp),
        ...coords(o),
    };
};

const material = (v: unknown): Material => {
    const o = obj(v);
    return {
        uuid: str(o.uuid), xmlId: str(o.xmlId), name: str(o.name), rmCode: str(o.rmCode), materialClass: str(o.materialClass),
        description: str(o.description), itemQuantities: str(o.itemQuantities), minimumSampleSize: str(o.minimumSampleSize),
        isCertified: bool(o.isCertified), materialIdentifiers: list(o.materialIdentifiers, identifier),
        ...(o.identifiersEdited === true ? { identifiersEdited: true } : {}),
        ...coords(o),
    };
};

const DSI_SOURCES = new Set(['rules', 'ai', 'manual']);
const quantity = (v: unknown): Quantity => {
    const o = obj(v);
    const q: Quantity = {
        uuid: str(o.uuid), name: str(o.name), value: str(o.value), dsiValue: str(o.dsiValue), dsiUnit: str(o.dsiUnit),
        unit: str(o.unit), uncertainty: str(o.uncertainty), coverageFactor: str(o.coverageFactor),
        coverageProbability: str(o.coverageProbability), distribution: str(o.distribution),
        identifiers: list(o.identifiers, identifier),
        ...coords(o),
    };
    const label = optStr(o.label), kind = optStr(o.quantityKind), note = optStr(o.dsiNote);
    if (label !== undefined) q.label = label;
    if (kind !== undefined) q.quantityKind = kind;
    if (note !== undefined) q.dsiNote = note;
    if (typeof o.dsiSource === 'string' && DSI_SOURCES.has(o.dsiSource)) q.dsiSource = o.dsiSource as Quantity['dsiSource'];
    if (o.identifiersEdited === true) q.identifiersEdited = true;
    // The row's own description and method are part of the context its unit is read in (xmlGenerator).
    const extra = q as Quantity & { description?: string; method?: string };
    const description = optStr(o.description), method = optStr(o.method);
    if (description !== undefined) extra.description = description;
    if (method !== undefined) extra.method = method;
    return q;
};

const result = (v: unknown): MeasurementResult => {
    const o = obj(v);
    const r: MeasurementResult = { uuid: str(o.uuid), name: str(o.name), description: str(o.description), quantities: list(o.quantities, quantity), ...coords(o) };
    const reasoning = optStr(o.coverageReasoning), mat = optStr(o.materialRef), lot = optStr(o.linkedBatchLot);
    if (reasoning !== undefined) r.coverageReasoning = reasoning;
    if (mat) r.materialRef = mat;
    if (lot !== undefined) r.linkedBatchLot = lot;
    return r;
};

const property = (v: unknown): MaterialProperty => {
    const o = obj(v);
    const p: MaterialProperty = {
        uuid: str(o.uuid), id: str(o.id), name: str(o.name), description: str(o.description), isCertified: bool(o.isCertified),
        procedures: str(o.procedures), results: list(o.results, result),
    };
    const mat = optStr(o.materialRef);
    if (mat) p.materialRef = mat;
    return p;
};

const VALIDITY = new Set(['Until Revoked', 'Time After Dispatch', 'Specific Time']);
const STATEMENTS = ['intendedUse', 'commutability', 'storageInformation', 'handlingInstructions', 'metrologicalTraceability',
    'healthAndSafety', 'subcontractors', 'legalNotice', 'referenceToCertificationReport'] as const;

const keys = (v: unknown): string[] => Array.from(new Set(list(v, x => (typeof x === 'string' && VALUE_KEY.test(x) ? x : '')).filter(Boolean)));
const correction = (v: unknown): ReviewCorrection => { const o = obj(v); return { field: str(o.field), from: str(o.from), to: str(o.to), source: str(o.source) }; };
export const reviewOfState = (v: unknown): ReviewState | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const o = obj(v);
    const review: ReviewState = { aiFilled: keys(o.aiFilled), verified: keys(o.verified) };
    const corrections = list(o.corrections, correction).slice(0, 100).filter(c => c.field && c.to);
    if (corrections.length) review.corrections = corrections;
    return review;
};

/** The form fields of a document (everything but the embedded files), with their types checked. */
export const formOf = (v: unknown): Omit<DRMD, 'binaryDocuments'> => {
    const d = obj(v), ad = obj(d.administrativeData), st = obj(d.statements), off = obj(st.official);
    const validity = str(ad.validityType);
    const official = Object.fromEntries(STATEMENTS.map(k => [k, str(off[k])])) as Record<typeof STATEMENTS[number], string>;
    const form: Omit<DRMD, 'binaryDocuments'> = {
        administrativeData: {
            title: str(ad.title), uniqueIdentifier: str(ad.uniqueIdentifier), documentVersion: str(ad.documentVersion),
            dataVersion: num(ad.dataVersion), documentIdentifiers: list(ad.documentIdentifiers, identifier),
            validityType: (VALIDITY.has(validity) ? validity : 'Until Revoked') as DRMD['administrativeData']['validityType'],
            durationY: num(ad.durationY), durationM: num(ad.durationM), dateOfIssue: str(ad.dateOfIssue), specificTime: str(ad.specificTime),
            producers: list(ad.producers, producer), responsiblePersons: list(ad.responsiblePersons, person),
            ...coords(ad),
        },
        materials: list(d.materials, material),
        properties: list(d.properties, property),
        statements: {
            official: { ...official, ...coords(off) },
            custom: list(st.custom, (x): CustomStatement => { const o = obj(x); return { uuid: str(o.uuid), name: str(o.name), content: str(o.content) }; }),
        },
        comments: list(d.comments, (x): Comment => { const o = obj(x); return { uuid: str(o.uuid), author: str(o.author), date: str(o.date), content: str(o.content) }; }),
        documents: list(d.documents, (x): AdditionalDocument => { const o = obj(x); return { uuid: str(o.uuid), title: str(o.title), type: str(o.type), content: str(o.content) }; }),
        generalComment: str(d.generalComment),
    };
    const review = reviewOfState(d.review);
    if (review) form.review = review;
    return form;
};

/** The JSON written into the XML comment. */
export const formStateJson = (data: DRMD): string => JSON.stringify({ v: FORM_STATE_VERSION, form: formOf(data) });

/** The form from that JSON (already parsed), or null when it is not a form state of this version. */
export const formFromState = (state: unknown): Omit<DRMD, 'binaryDocuments'> | null => {
    const s = obj(state);
    if (s.v !== FORM_STATE_VERSION || !s.form || typeof s.form !== 'object') return null;
    return formOf(s.form);
};
