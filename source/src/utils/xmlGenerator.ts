// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import { DRMD, Identifier, rmDocumentName } from "../types";
import { resolveDsiUnit } from "./unitConverter";
import { checkDsi, verifySameUnit, parseHumanUnit, isKindDependent, issuesText, toDsi, unitTextNotes } from "./dsi";
import { safeHttpUrl } from "./safeUrl";
import { DRMD_SCHEMA_VERSION } from "./drmdBusinessRules";
import {
    toDecimalString, readNumber, toUncertaintyString, toCoverageFactor, toCoverageProbability, toXsdDate,
    toCountryCode, notEmpty, isNoQuantityPlaceholder, isPlaceholderText,
} from "./xmlValues";

/*
 * DRMD XML generator — writes documents that validate against drmd.xsd (DRMD 1.0.0), which reuses
 * the PTB DCC (dcc:) and D-SI (si:) schemas. The rules this file follows, and why:
 *
 *  - Optional elements are written only when they carry content. An empty dcc:eMail, dcc:phone,
 *    dcc:street ... violates dcc:notEmptyStringType, and an always-present but empty element (e.g.
 *    a material description) would also make a Schematron rule pass that should fail.
 *  - Quantities use the D-SI elements (si:real, si:realListXMLList) and DCC fall-backs
 *    (dcc:noQuantity, dcc:charsXMLList). si:value must be a plain decimal, so limits ("< 2"),
 *    ranges and text are written as dcc:noQuantity. An expanded uncertainty is only written when
 *    the value, k AND p are all known, because D-SI requires all three.
 *  - drmd:material has no @id. Links from a properties block / result to a material (and lot) point
 *    at the material's drmd:materialIdentifier/@id, as the DRMD guidance document prescribes, and
 *    every @refId written here resolves to an @id written here (Xerces rejects dangling IDREFs).
 *  - Exactly one drmd:referenceMaterialProducer is allowed by the schema.
 *
 * Whatever the generator cannot write faithfully is reported as a GeneratorNote rather than written
 * as invalid XML or dropped silently; the validator shows these notes to the user.
 */

export interface GeneratorNote {
    code: string;
    severity: 'error' | 'warning';
    section: string;
    message: string;
}

// XML 1.0 forbids most control characters; PDF text extraction occasionally produces them.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
// Keep surrogate PAIRS (emoji, rare CJK), drop lone halves — they cannot be serialised as UTF-8.
const stripInvalidXml = (s: string) =>
    s.replace(INVALID_XML_CHARS, '').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, m => (m.length === 2 ? m : ''));

const escapeXml = (unsafe: string | undefined | number | boolean | null) => {
    if (unsafe === undefined || unsafe === null) return '';
    return stripInvalidXml(String(unsafe)).replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

const content = (text: string, indent: string) => `${indent}<dcc:content>${escapeXml(text)}</dcc:content>`;

const isLotScheme = (scheme?: string) => /^(lot|batch|lot\s*no\.?|batch\s*no\.?|charge)$/i.test((scheme || '').trim());

// Helper: collect coordinate annotations from DRMD entities into a JSON-safe structure
const hasCoordData = (entity: { fieldCoordinates?: Record<string, number[]>; sectionCoordinates?: number[]; originalTexts?: Record<string, string> }) => {
    return (entity.fieldCoordinates && Object.keys(entity.fieldCoordinates).length > 0) ||
           (entity.sectionCoordinates && entity.sectionCoordinates.length > 0) ||
           (entity.originalTexts && Object.keys(entity.originalTexts).length > 0);
};

const pickCoords = (entity: { fieldCoordinates?: Record<string, number[]>; sectionCoordinates?: number[]; originalTexts?: Record<string, string> }) => {
    const obj: Record<string, unknown> = {};
    if (entity.fieldCoordinates && Object.keys(entity.fieldCoordinates).length > 0) obj.fieldCoordinates = entity.fieldCoordinates;
    if (entity.sectionCoordinates && entity.sectionCoordinates.length > 0) obj.sectionCoordinates = entity.sectionCoordinates;
    if (entity.originalTexts && Object.keys(entity.originalTexts).length > 0) obj.originalTexts = entity.originalTexts;
    return obj;
};

const generateAnnotationsComment = (data: DRMD): string => {
    const annotations: Record<string, unknown> = {};

    // Producers
    const producers = data.administrativeData.producers
        .map(p => hasCoordData(p) ? pickCoords(p) : null)
        .filter(p => p !== null);
    if (producers.length > 0) annotations.producers = producers;

    // Responsible Persons
    const responsiblePersons = data.administrativeData.responsiblePersons
        .map(p => hasCoordData(p) ? pickCoords(p) : null)
        .filter(p => p !== null);
    if (responsiblePersons.length > 0) annotations.responsiblePersons = responsiblePersons;

    // Materials
    const materials = data.materials
        .map(m => hasCoordData(m) ? pickCoords(m) : null)
        .filter(m => m !== null);
    if (materials.length > 0) annotations.materials = materials;

    // Administrative Data (top-level coordinates)
    if (hasCoordData(data.administrativeData)) {
        annotations.administrativeData = pickCoords(data.administrativeData);
    }

    // Properties (with nested results and quantities)
    const properties = data.properties.map(prop => {
        const propEntry: Record<string, unknown> = {};
        const results = prop.results.map(res => {
            const resEntry: Record<string, unknown> = {};
            if (hasCoordData(res)) Object.assign(resEntry, pickCoords(res));
            const quantities = res.quantities
                .map(q => hasCoordData(q) ? pickCoords(q) : null)
                .filter(q => q !== null);
            if (quantities.length > 0) resEntry.quantities = quantities;
            return Object.keys(resEntry).length > 0 ? resEntry : null;
        }).filter(r => r !== null);
        if (results.length > 0) propEntry.results = results;
        return Object.keys(propEntry).length > 0 ? propEntry : null;
    }).filter(p => p !== null);
    if (properties.length > 0) annotations.properties = properties;

    // Statements
    if (hasCoordData(data.statements.official)) {
        annotations.statements = pickCoords(data.statements.official);
    }

    // Only produce a comment if there is any coordinate data
    if (Object.keys(annotations).length === 0) return '';

    // "--" is not allowed inside an XML comment; - is the same character to JSON.parse.
    const json = stripInvalidXml(JSON.stringify(annotations).replace(/--/g, '-\\u002d'));
    return `\n  <!-- DRMD-GENERATOR-ANNOTATIONS: This section is auto-generated by the AI-powered DRMD Generator for PDF coordinate tracking and highlighting. It does not affect schema validation. DATA:${json} -->`;
};

export interface BuildOptions {
    /** Embed the source PDF(s) as drmd:document. Default true; the validator skips them. */
    includeDocuments?: boolean;
    /** Append the coordinate annotations comment. Default true. */
    includeAnnotations?: boolean;
}

export const buildDrmdXml = (data: DRMD, options: BuildOptions = {}): { xml: string; notes: GeneratorNote[] } => {
    const notes: GeneratorNote[] = [];
    const note = (code: string, severity: GeneratorNote['severity'], section: string, message: string) =>
        notes.push({ code, severity, section, message });
    const admin = data.administrativeData;
    const isPIS = admin.title === 'productInformationSheet';

    // ---------------------------------------------------------------- coreData
    const uniqueIdentifier = notEmpty(admin.uniqueIdentifier);
    if (!uniqueIdentifier) note('XSD-UNIQUE-ID', 'error', 'Administrative', 'The document needs a Unique Identifier (drmd:uniqueIdentifier must not be empty).');

    let validityXml = '';
    if (admin.validityType === "Until Revoked") {
        validityXml = `        <drmd:untilRevoked>true</drmd:untilRevoked>`;
    } else if (admin.validityType === "Specific Time") {
        const date = toXsdDate(admin.specificTime);
        if (date) {
            validityXml = `        <drmd:specificTime>${date}</drmd:specificTime>`;
        } else {
            note('XSD-DATE', 'error', 'Administrative',
                `The validity date "${admin.specificTime || ''}" is not a valid date. Enter it as YYYY-MM-DD (xs:date).`);
        }
    } else if (admin.validityType === "Time After Dispatch") {
        // Whole, non-negative numbers only: the values may come from an AI answer or an imported file.
        const years = Math.max(0, Math.floor(Number(admin.durationY) || 0));
        const months = Math.max(0, Math.floor(Number(admin.durationM) || 0));
        let iso = "P";
        if (years) iso += `${years}Y`;
        if (months) iso += `${months}M`;
        if (iso === "P") {
            iso = "P0Y";
            note('DATA-VALIDITY', 'error', 'Administrative',
                'Validity "Time After Dispatch" needs a period: enter the years and/or months (it is currently zero).');
        }
        validityXml = `        <drmd:timeAfterDispatch>\n`;
        if (notEmpty(admin.dateOfIssue)) {
            const dispatch = toXsdDate(admin.dateOfIssue);
            if (dispatch) validityXml += `          <drmd:dispatchDate>${dispatch}</drmd:dispatchDate>\n`;
            else note('XSD-DISPATCH-DATE', 'warning', 'Administrative',
                `The dispatch date "${admin.dateOfIssue}" is not a valid date (YYYY-MM-DD), so it was left out of the XML.`);
        }
        validityXml += `          <drmd:period>${iso}</drmd:period>\n`;
        validityXml += `        </drmd:timeAfterDispatch>`;
    } else {
        note('XSD-VALIDITY', 'error', 'Administrative',
            'The period of validity is not set. Choose the validity type: Until Revoked, Time After Dispatch or Specific Time.');
    }

    let adminXml = `
  <drmd:administrativeData>
    <drmd:coreData>
      <drmd:titleOfTheDocument>${escapeXml(admin.title)}</drmd:titleOfTheDocument>
      <drmd:uniqueIdentifier>${escapeXml(uniqueIdentifier || '')}</drmd:uniqueIdentifier>
      <drmd:documentVersion>${escapeXml(notEmpty(admin.documentVersion) || '1.0')}</drmd:documentVersion>`;

    const docIds = (admin.documentIdentifiers || []).filter(id => notEmpty(id.scheme) && notEmpty(id.value));
    if (docIds.length > 0) {
        adminXml += `
      <drmd:documentIdentifiers>`;
        docIds.forEach(id => {
            adminXml += `
        <drmd:documentIdentifier>
          <drmd:scheme>${escapeXml(notEmpty(id.scheme))}</drmd:scheme>
          <drmd:value>${escapeXml(notEmpty(id.value))}</drmd:value>${safeHttpUrl(id.link) ? `
          <drmd:link>${escapeXml(safeHttpUrl(id.link))}</drmd:link>` : ''}
        </drmd:documentIdentifier>`;
        });
        adminXml += `
      </drmd:documentIdentifiers>`;
    }
    adminXml += `
      <drmd:validity>
${validityXml}
      </drmd:validity>
    </drmd:coreData>`;

    // ---------------------------------------------------------------- producer (exactly one)
    const producers = admin.producers || [];
    if (producers.length > 1) {
        note('XSD-PRODUCER-COUNT', 'error', 'Administrative',
            `The DRMD schema allows exactly one Reference Material Producer, but ${producers.length} are entered. ` +
            `Only the first ("${producers[0].name || 'unnamed'}") would be written; remove the others ` +
            `(a contributing organisation can be named in the Subcontractors statement).`);
    }
    const prod = producers[0];
    if (!prod) {
        note('XSD-PRODUCER-MISSING', 'error', 'Administrative',
            'The document has no Reference Material Producer. The schema requires exactly one: add the producer with its name and address.');
    }
    if (prod) {
        const prodName = prod.name || '';
        if (!notEmpty(prodName)) note('DATA-PRODUCER-NAME', 'error', 'Administrative', 'The Reference Material Producer needs a name.');

        // dcc:location is a repeatable choice; each element must be non-empty, at least one present.
        const loc: string[] = [];
        const addr = prod.address || ({} as any);
        if (notEmpty(addr.street)) loc.push(`          <dcc:street>${escapeXml(notEmpty(addr.street))}</dcc:street>`);
        if (notEmpty(addr.streetNo)) loc.push(`          <dcc:streetNo>${escapeXml(notEmpty(addr.streetNo))}</dcc:streetNo>`);
        if (notEmpty(addr.postCode)) loc.push(`          <dcc:postCode>${escapeXml(notEmpty(addr.postCode))}</dcc:postCode>`);
        if (notEmpty(addr.city)) loc.push(`          <dcc:city>${escapeXml(notEmpty(addr.city))}</dcc:city>`);
        if (notEmpty(addr.countryCode)) {
            const cc = toCountryCode(addr.countryCode);
            if (cc) {
                loc.push(`          <dcc:countryCode>${cc}</dcc:countryCode>`);
            } else {
                loc.push(`          <dcc:further>\n${content(`Country: ${notEmpty(addr.countryCode)}`, '            ')}\n          </dcc:further>`);
                note('XSD-COUNTRY', 'warning', 'Administrative',
                    `"${addr.countryCode}" is not a two-letter ISO 3166 country code, so it was written as free text. Enter the code (e.g. DE, BE, JP).`);
            }
        }
        if (loc.length === 0) {
            note('XSD-ADDRESS', 'error', 'Administrative',
                'The producer address is empty. The schema requires at least one address element (street, city, post code or country).');
        }

        adminXml += `
    <drmd:referenceMaterialProducer>
      <drmd:name>
${content(prodName, '        ')}
      </drmd:name>
      <drmd:contact>
        <dcc:name>
${content(prodName, '          ')}
        </dcc:name>`;
        if (notEmpty(prod.email)) adminXml += `
        <dcc:eMail>${escapeXml(notEmpty(prod.email))}</dcc:eMail>`;
        if (notEmpty(prod.phone)) adminXml += `
        <dcc:phone>${escapeXml(notEmpty(prod.phone))}</dcc:phone>`;
        if (notEmpty(prod.fax)) adminXml += `
        <dcc:fax>${escapeXml(notEmpty(prod.fax))}</dcc:fax>`;
        adminXml += `
        <dcc:location>
${loc.join('\n')}
        </dcc:location>
      </drmd:contact>`;

        // Organization Identifiers (e.g. ROR)
        const validOrgIds = (prod.organizationIdentifiers || []).filter(id => notEmpty(id.value));
        if (validOrgIds.length > 0) {
            adminXml += `
      <drmd:organizationIdentifiers>`;
            validOrgIds.forEach(id => {
                adminXml += `
        <drmd:organizationIdentifier>
          <drmd:scheme>${escapeXml(notEmpty(id.scheme) || 'ROR')}</drmd:scheme>
          <drmd:value>${escapeXml(notEmpty(id.value))}</drmd:value>${safeHttpUrl(id.link) ? `
          <drmd:link>${escapeXml(safeHttpUrl(id.link))}</drmd:link>` : ''}
        </drmd:organizationIdentifier>`;
            });
            adminXml += `
      </drmd:organizationIdentifiers>`;
        }

        adminXml += `
    </drmd:referenceMaterialProducer>`;
    }

    // ---------------------------------------------------------------- responsible persons
    // Only persons with a name are written; the form's empty default row is not a person.
    const persons = (admin.responsiblePersons || []).filter(p => notEmpty(p.name));
    if (persons.length > 0) {
        adminXml += `
    <drmd:respPersons>`;
        persons.forEach(p => {
            adminXml += `
      <dcc:respPerson>
        <dcc:person>
          <dcc:name>
${content(p.name, '            ')}
          </dcc:name>
        </dcc:person>`;
            if (notEmpty(p.description)) {
                adminXml += `
        <dcc:description>
${content(p.description, '          ')}
        </dcc:description>`;
            }
            if (notEmpty(p.role)) adminXml += `
        <dcc:role>${escapeXml(notEmpty(p.role))}</dcc:role>`;
            adminXml += `
        <dcc:mainSigner>${p.mainSigner ? 'true' : 'false'}</dcc:mainSigner>`;
            if (p.cryptElectronicSeal) adminXml += `
        <dcc:cryptElectronicSeal>true</dcc:cryptElectronicSeal>`;
            if (p.cryptElectronicSignature) adminXml += `
        <dcc:cryptElectronicSignature>true</dcc:cryptElectronicSignature>`;
            if (p.cryptElectronicTimeStamp) adminXml += `
        <dcc:cryptElectronicTimeStamp>true</dcc:cryptElectronicTimeStamp>`;
            adminXml += `
      </dcc:respPerson>`;
        });
        adminXml += `
    </drmd:respPersons>`;
    }
    adminXml += `
  </drmd:administrativeData>`;

    // ---------------------------------------------------------------- materials
    // Each materialIdentifier gets an @id; the first one is the material's anchor for @refId links.
    const anchorOf = new Map<string, string>();                                        // material uuid → anchor id
    const lotIds = new Map<string, Array<{ id: string; value: string }>>();            // material uuid → lot ids
    const allLotIds: Array<{ id: string; value: string; materialUuid: string }> = [];

    // A short piece of one material quantity (minimumSampleSize / itemQuantities)
    const renderItemQuantity = (raw: string, label: string, where: string) => {
        const text = raw.trim();
        let body: string;
        const match = text.match(/^(\S+)\s*(\S.*)$/);
        const num = match ? toDecimalString(match[1]) : null;
        const conv = match && num !== null ? resolveDsiUnit(match[2]) : null;
        if (num !== null && conv) {
            // The number exactly as written: the unit is only renamed into its D-SI form
            body = `
          <si:real>
            <si:value>${num}</si:value>
            <si:unit>${escapeXml(conv.dsiUnit)}</si:unit>
          </si:real>`;
        } else {
            // "approx. 50 g", "0.5 - 1 g", "50 µL for UV spectrophotometry": keep the wording as text
            body = `
          <dcc:noQuantity>
${content(text, '            ')}
          </dcc:noQuantity>`;
            if (where === 'minimumSampleSize' && /\d/.test(text)) {
                note('XSD-VALUE-AS-TEXT', 'warning', 'Materials',
                    `${label} "${text}" is not a single number with a unit, so it is written as text (dcc:noQuantity), not as a machine-readable D-SI value.`);
            }
        }
        return `
        <dcc:itemQuantity>
          <dcc:name>
${content(label, '            ')}
          </dcc:name>${body}
        </dcc:itemQuantity>`;
    };

    let materialsXml = `
  <drmd:materials>`;
    (data.materials || []).forEach((mat, m) => {
        if (!notEmpty(mat.name)) note('DATA-MATERIAL-NAME', 'error', 'Materials', `Material ${m + 1} needs a name.`);
        materialsXml += `
    <drmd:material>
      <drmd:name>
${content(mat.name || '', '        ')}
      </drmd:name>`;
        if (notEmpty(mat.description)) {
            materialsXml += `
      <drmd:description>
${content(mat.description, '        ')}
      </drmd:description>`;
        }
        if (!isNoQuantityPlaceholder(mat.minimumSampleSize)) {
            materialsXml += `
      <drmd:minimumSampleSize>${renderItemQuantity(String(mat.minimumSampleSize), 'Minimum sample size', 'minimumSampleSize')}
      </drmd:minimumSampleSize>`;
        }
        if (!isNoQuantityPlaceholder(mat.itemQuantities)) {
            materialsXml += `
      <drmd:itemQuantities>${renderItemQuantity(String(mat.itemQuantities), 'Item quantity', 'itemQuantities')}
      </drmd:itemQuantities>`;
        }

        // Identifiers of the RM itself (ISO 33401 5.2.3): the RM code plus lot/batch numbers etc.
        // The DOCUMENT's uniqueIdentifier is deliberately NOT used as a fallback: DRMD-016 states it
        // does not identify the material, and writing it would hide a missing RM code.
        const ids: Identifier[] = (mat.materialIdentifiers || []).filter(id => notEmpty(id.value));
        const rmCode = notEmpty(mat.rmCode);
        if (rmCode && !ids.some(id => id.scheme === 'catalogNumber' && id.value.trim() === rmCode)) {
            ids.unshift({ scheme: 'catalogNumber', value: rmCode });
        }
        if (ids.length > 0) {
            materialsXml += `
      <drmd:materialIdentifiers>`;
            ids.forEach((id, k) => {
                const xmlId = `matid_${m + 1}_${k + 1}`;
                if (k === 0) anchorOf.set(mat.uuid, xmlId);
                if (isLotScheme(id.scheme)) {
                    const entry = { id: xmlId, value: id.value.trim() };
                    lotIds.set(mat.uuid, [...(lotIds.get(mat.uuid) || []), entry]);
                    allLotIds.push({ ...entry, materialUuid: mat.uuid });
                }
                materialsXml += `
        <drmd:materialIdentifier id="${xmlId}">
          <drmd:scheme>${escapeXml(notEmpty(id.scheme) || 'MaterialID')}</drmd:scheme>
          <drmd:value>${escapeXml(notEmpty(id.value))}</drmd:value>${safeHttpUrl(id.link) ? `
          <drmd:link>${escapeXml(safeHttpUrl(id.link))}</drmd:link>` : ''}
        </drmd:materialIdentifier>`;
            });
            materialsXml += `
      </drmd:materialIdentifiers>`;
        }

        materialsXml += `
    </drmd:material>`;
    });
    materialsXml += `
  </drmd:materials>`;

    // ---------------------------------------------------------------- properties
    const materials = data.materials || [];
    const singleMaterialUuid = materials.length === 1 ? materials[0].uuid : undefined;

    // Rows of the current property block whose uncertainty is written as a standard uncertainty.
    let standardUncRows: string[] = [];

    // One measured quantity → the D-SI / DCC element that represents it faithfully.
    const renderQuantityValue = (q: any, where: string, certified: boolean, unitCtx: { texts: string[] } = { texts: [] }): string => {
        const raw: string = String(q.value ?? '').trim();
        const rawUnit: string = String(q.unit ?? '').trim();
        const humanUnit = rawUnit && rawUnit !== '\\one' ? ` ${rawUnit}` : '';
        // D-SI attaches an uncertainty to a single number only; anything else would lose it silently.
        const uncertaintyNotWritten = () => {
            if (notEmpty(q.uncertainty) === null) return;
            note('XSD-UNCERTAINTY-NOT-WRITTEN', 'warning', 'Properties',
                `${where}: the uncertainty "${q.uncertainty}" is not written to the XML, because ` +
                `${raw ? `the value "${raw}" is not a single number` : 'the row has no value'}. Enter the value as one number to keep its uncertainty.`);
        };

        if (!raw) {
            uncertaintyNotWritten();
            note('DATA-EMPTY-VALUE', 'warning', 'Properties', `${where} has no value; it is written as "Not specified".`);
            return `
                <dcc:noQuantity>
                  <dcc:content>Not specified</dcc:content>
                </dcc:noQuantity>`;
        }

        // The D-SI unit of the form: converted by the rules, by the AI (checked by the rules) or typed by
        // the user. A document without one (older or imported) gets the rules' conversion. The value is
        // never scaled: the unit is only written in its D-SI form of the same size.
        const stored = String(q.dsiUnit ?? '').trim();
        const storedCheck = stored.startsWith('\\') ? checkDsi(stored) : null;
        if (storedCheck && !storedCheck.ok) {
            note('DSI-UNIT-INVALID', 'error', 'Properties',
                `${where}: the D-SI unit "${stored}" breaks the D-SI rules: ${issuesText(storedCheck.errors)} ` +
                `Correct it in the D-SI unit column.`);
        }
        // (ppb or ‰ alone: whether the D-SI fraction fits depends on the kind of fraction, which the
        // rules or the AI took from the context when they wrote it; it is not a mismatch here.)
        const mismatch = !!storedCheck?.ok && !!rawUnit && !!parseHumanUnit(rawUnit) && !isKindDependent(rawUnit) && !verifySameUnit(rawUnit, stored).ok;
        // The D-SI unit of the form is used. Only one from an older document (no record of how it was
        // written) that does not fit the unit is converted again; one typed in the form is kept, with a warning.
        const useStored = !!storedCheck?.ok && (!mismatch || !!q.dsiSource);
        if (useStored && mismatch && q.dsiSource === 'manual') {
            note('DSI-UNIT-MISMATCH', 'warning', 'Properties',
                `${where}: the D-SI unit ${stored} is not the same size as the unit "${rawUnit}". The value ${raw} is written unchanged with ${stored}, so check that the D-SI unit is right.`);
        }
        // A row whose D-SI unit was decided in the form (by the rules with its context, by the AI or by
        // hand) and left empty stays as typed: the XML says what the form shows.
        const decidedNone = !!q.dsiSource && !stored && !!rawUnit;
        const conv = useStored ? { dsiUnit: stored.replace(/\s+/g, '') } : decidedNone ? null : resolveDsiUnit(rawUnit || '\\one', unitCtx);
        const unitOut = conv ? conv.dsiUnit : rawUnit;
        if (!conv && rawUnit) {
            note('XSD-UNIT', 'warning', 'Properties',
                `${where}: the unit "${rawUnit}" is written as typed, because it has no D-SI form of the same size: ${toDsi(rawUnit, unitCtx).explanation} ` +
                `D-SI consumers cannot read it (class Improvable, D-SI guide Section 8, p. 41); the guide writes such values in si:hybrid with an SI sibling (Section 7, pp. 31–38).`);
        }
        if (!rawUnit && !useStored) {
            note('DSI-UNIT-EMPTY', 'warning', 'Properties',
                `${where} has no unit, so it is written with \\one (a quantity of dimension one, Table A.2, D-SI guide p. 48). If the certificate gives a unit, enter it.`);
        }
        if (conv) {
            const written = checkDsi(conv.dsiUnit);
            const bronze = written.notes.filter(n => n.rule === 'R020');
            if (bronze.length) note('DSI-UNIT-BRONZE', 'warning', 'Properties', `${where}: ${issuesText(bronze)} The value ${raw} is unchanged.`);
            const syntax = written.notes.filter(n => n.rule === 'Section 3');
            if (syntax.length) note('DSI-UNIT-NOTE', 'warning', 'Properties', `${where}: ${conv.dsiUnit}: ${issuesText(syntax)}`);
            // Words of the unit text that a D-SI unit cannot hold (analyte, basis, "as N", pH): the
            // quantity name has to carry them, or the XML loses them.
            const lost = rawUnit ? unitTextNotes(rawUnit).filter(n => !String(q.name ?? '').toLowerCase().includes(n.text.toLowerCase().replace(/^[([]|[)\]]$/g, ''))) : [];
            if (lost.length) {
                note('DSI-UNIT-ANNOTATION', 'warning', 'Properties',
                    `${where}: the unit "${rawUnit}" contains ${lost.map(n => `"${n.text}"`).join(', ')}, which is not part of a unit (a D-SI unit is built only from unit, prefix and exponent identifiers, D-SI guide Section 3, pp. 12–17). ` +
                    `The value is written with ${conv.dsiUnit}; state ${lost.length > 1 ? 'them' : 'it'} in the quantity name so that the XML keeps ${lost.length > 1 ? 'them' : 'it'}.`);
            }
        }
        const scale = (d: string) => d;

        // A number that cannot be read safely ("1,234": decimal comma or thousands separator?) is not
        // written as a number at all: a wrong reading would change the value by a factor of 1000.
        const reading = readNumber(raw);
        if (reading.ambiguous) {
            uncertaintyNotWritten();
            note('VALUE-AMBIGUOUS', 'error', 'Properties',
                `${where}: the value "${raw}" can be read as ${raw.replace(',', '.')} (decimal comma) or as ${raw.replace(',', '')} (thousands separator). ` +
                `Enter it with a decimal point (D-SI guide Section 4, p. 19; rule R003, p. 70). It is written as text until then.`);
            return `
                <dcc:noQuantity>
${content(`${raw}${humanUnit}`, '                  ')}
                </dcc:noQuantity>`;
        }
        if (reading.grouped) {
            note('VALUE-DIGIT-GROUPS', 'warning', 'Properties',
                `${where}: the value "${raw}" is written as ${reading.value} (${reading.grouped === 'digit-groups' ? 'digit groups' : 'thousands separators'} removed; si:value has no separators, rule R003, D-SI guide p. 70). Check that it is one number.`);
        }

        // 1. A single number → si:real
        const num = reading.value;
        if (num !== null) {
            let xml = `
                <si:real>
                  <si:value>${scale(num)}</si:value>
                  <si:unit>${escapeXml(unitOut.replace(/\s+/g, ''))}</si:unit>`;
            const hasUnc = notEmpty(q.uncertainty) !== null;
            if (hasUnc) {
                const u = toUncertaintyString(q.uncertainty);
                const k = toCoverageFactor(q.coverageFactor);
                const p = toCoverageProbability(q.coverageProbability);
                // Decided per row: k and p both given → expanded uncertainty (si:expandedMU);
                // neither given → standard uncertainty (si:standardMU), which D-SI defines without
                // k and p; only one of them (or an invalid one) → error, because the row is
                // clearly meant as an expanded uncertainty but cannot be written as one.
                const noK = notEmpty(q.coverageFactor) === null;
                const noP = notEmpty(q.coverageProbability) === null;
                if (u === null) {
                    note('XSD-UNCERTAINTY-INVALID', 'error', 'Properties',
                        `${where}: the uncertainty "${q.uncertainty}" is not a single non-negative number, so it cannot be written as a D-SI uncertainty.`);
                } else if (noK && noP) {
                    standardUncRows.push(where);
                    xml += `
                  <si:measurementUncertaintyUnivariate>
                    <si:standardMU>
                      <si:valueStandardMU>${scale(u)}</si:valueStandardMU>${notEmpty(q.distribution) ? `
                      <si:distribution>${escapeXml(notEmpty(q.distribution))}</si:distribution>` : ''}
                    </si:standardMU>
                  </si:measurementUncertaintyUnivariate>`;
                } else if (k === null || p === null) {
                    const missing = [k === null ? `coverage factor k${notEmpty(q.coverageFactor) ? ` ("${q.coverageFactor}" is not valid)` : ''}` : '',
                                     p === null ? `coverage probability P${notEmpty(q.coverageProbability) ? ` ("${q.coverageProbability}" is not valid)` : ''}` : '']
                        .filter(Boolean).join(' and ');
                    note('XSD-UNCERTAINTY-INCOMPLETE', 'error', 'Properties',
                        `${where}: the uncertainty ${q.uncertainty} has no ${missing}. An expanded uncertainty must be accompanied by values for k and P ` +
                        `(si:expandedMU). You may leave k and P blank if the uncertainty is a standard uncertainty (si:standardMU). Please correct.`);
                } else {
                    xml += `
                  <si:measurementUncertaintyUnivariate>
                    <si:expandedMU>
                      <si:valueExpandedMU>${scale(u)}</si:valueExpandedMU>
                      <si:coverageFactor>${k}</si:coverageFactor>
                      <si:coverageProbability>${p}</si:coverageProbability>${notEmpty(q.distribution) ? `
                      <si:distribution>${escapeXml(notEmpty(q.distribution))}</si:distribution>` : ''}
                    </si:expandedMU>
                  </si:measurementUncertaintyUnivariate>`;
                }
            }
            xml += `
                </si:real>`;
            return xml;
        }

        const parts = raw.split(/\s+/);

        // 2. Several numbers → ONE si:valueXMLList with the numbers space-separated (they do not repeat)
        const listNums = parts.map(toDecimalString);
        if (parts.length > 1 && listNums.every(n => n !== null)) {
            uncertaintyNotWritten();
            const u = (unitOut || '\\one').replace(/\s+/g, '');
            return `
                <si:realListXMLList>
                  <si:valueXMLList>${listNums.map(n => scale(n as string)).join(' ')}</si:valueXMLList>
                  <si:unitXMLList>${escapeXml(parts.map(() => u).join(' '))}</si:unitXMLList>
                </si:realListXMLList>`;
        }

        // 3. A list of codes → dcc:charsXMLList
        if (parts.length > 1 && parts.every(p => /^[A-Z0-9-]+$/.test(p))) {
            uncertaintyNotWritten();
            return `
                <dcc:charsXMLList>${escapeXml(raw)}</dcc:charsXMLList>`;
        }

        // 4. Limits ("< 2", "> 97.8"), ranges and text: D-SI has no element for these, so keep the
        //    wording, with its original unit, as dcc:noQuantity.
        uncertaintyNotWritten();
        if (certified) {
            note('XSD-VALUE-AS-TEXT', 'warning', 'Properties',
                `${where}: "${raw}${humanUnit}" is not a single number (a limit, range or text), so it is written as text (dcc:noQuantity). ` +
                `It is valid, but not machine-readable as a value.`);
        }
        return `
                <dcc:noQuantity>
${content(`${raw}${humanUnit}`, '                  ')}
                </dcc:noQuantity>`;
    };

    let propertiesXml = `
  <drmd:propertiesList>`;
    (data.properties || []).forEach((prop, pIdx) => {
        const certified = isPIS ? false : !!prop.isCertified;
        const propLabel = `Property "${prop.name || pIdx + 1}"`;
        standardUncRows = [];

        // Which material does each table belong to?
        const resultMaterial = (res: any) => res.materialRef || prop.materialRef || singleMaterialUuid;
        const results = prop.results || [];
        if (results.length === 0) {
            note('XSD-PROPERTY-EMPTY', 'error', 'Properties',
                `${propLabel} has no table. The schema requires at least one result per property set: add a table with its rows, or remove the property set.`);
        }
        const resultMats = results.map(resultMaterial);
        const sameMat = resultMats.length > 0 && resultMats.every(u => u && u === resultMats[0]) ? resultMats[0] : (prop.materialRef || singleMaterialUuid);
        const propAnchor = sameMat ? anchorOf.get(sameMat) : undefined;
        if (materials.length > 1 && resultMats.some(u => !u || !anchorOf.get(u))) {
            note('XSD-MATERIAL-LINK', 'warning', 'Properties',
                `${propLabel}: this document has several materials, but not every table is linked to a material that has an identifier, ` +
                `so readers cannot tell which material the values belong to. Link each table to its material.`);
        }

        propertiesXml += `
    <drmd:properties${propAnchor ? ` refId="${propAnchor}"` : ''} isCertified="${certified}">
      <drmd:name>
${content(prop.name || '', '        ')}
      </drmd:name>`;
        if (notEmpty(prop.description)) {
            propertiesXml += `
      <drmd:description>
${content(prop.description, '        ')}
      </drmd:description>`;
        }
        if (notEmpty(prop.procedures)) {
            propertiesXml += `
      <drmd:procedures>
        <dcc:usedMethod>
          <dcc:name>
            <dcc:content>Procedure</dcc:content>
          </dcc:name>
          <dcc:description>
${content(prop.procedures, '            ')}
          </dcc:description>
        </dcc:usedMethod>
      </drmd:procedures>`;
        }
        propertiesXml += `
      <drmd:results>`;
        results.forEach((res, rIdx) => {
            // @refId on the result: its material (when it differs from the block's) and its lot/batch.
            const refs: string[] = [];
            const matUuid = resultMaterial(res);
            const anchor = matUuid ? anchorOf.get(matUuid) : undefined;
            if (anchor && anchor !== propAnchor) refs.push(anchor);
            const lot = notEmpty(res.linkedBatchLot);
            if (lot) {
                const norm = lot.toLowerCase();
                // Only a lot of THIS table's material — linking another material's lot would
                // contradict the material link. Without a material, any material's lot will do.
                const candidates = matUuid ? (lotIds.get(matUuid) || []) : allLotIds;
                const hit = candidates.find(l => l.value.toLowerCase() === norm);
                if (hit) {
                    refs.push(hit.id);
                } else {
                    note('XSD-LOT-LINK', 'warning', 'Properties',
                        `${propLabel}, table "${res.name || rIdx + 1}": linked lot/batch "${lot}" is not among the Lot/Batch identifiers of its material, so the link could not be written.`);
                }
            }

            propertiesXml += `
        <drmd:result${refs.length ? ` refId="${refs.join(' ')}"` : ''}>
          <drmd:name>
${content(notEmpty(res.name) || 'Values', '            ')}
          </drmd:name>`;
            if (notEmpty(res.description)) {
                propertiesXml += `
          <drmd:description>
${content(res.description, '            ')}
          </drmd:description>`;
            }
            const quantities = res.quantities || [];
            if (quantities.length === 0) {
                note('XSD-RESULT-EMPTY', 'error', 'Properties',
                    `${propLabel}, table "${res.name || rIdx + 1}" has no rows. The schema requires at least one quantity per result: add a row or remove the table.`);
            }
            propertiesXml += `
          <drmd:data>
            <drmd:list>`;
            quantities.forEach((q, qIdx) => {
                const where = `${propLabel}, row "${q.name || qIdx + 1}"`;
                propertiesXml += `
              <drmd:quantity>`;
                if (notEmpty(q.name)) {
                    propertiesXml += `
                <dcc:name>
${content(q.name, '                  ')}
                </dcc:name>`;
                }
                // What the certificate says around the unit (the same texts the form uses)
                const unitCtx = { texts: [q.name, (q as any).description, (q as any).method, res.name, res.description, prop.name, prop.description, prop.procedures, data.statements?.official?.metrologicalTraceability]
                    .map((t: any) => String(t ?? '').trim()).filter(Boolean) };
                propertiesXml += renderQuantityValue(q, where, certified, unitCtx);

                const validIds = (q.identifiers || []).filter((id: any) => notEmpty(id.scheme) && notEmpty(id.value));
                if (validIds.length > 0) {
                    propertiesXml += `
                <drmd:propertyIdentifiers>`;
                    validIds.forEach((id: any) => {
                        propertiesXml += `
                  <drmd:propertyIdentifier>
                    <drmd:scheme>${escapeXml(notEmpty(id.scheme))}</drmd:scheme>
                    <drmd:value>${escapeXml(notEmpty(id.value))}</drmd:value>${safeHttpUrl(id.link) ? `
                    <drmd:link>${escapeXml(safeHttpUrl(id.link))}</drmd:link>` : ''}
                  </drmd:propertyIdentifier>`;
                    });
                    propertiesXml += `
                </drmd:propertyIdentifiers>`;
                }

                propertiesXml += `
              </drmd:quantity>`;
            });
            propertiesXml += `
            </drmd:list>
          </drmd:data>
        </drmd:result>`;
        });
        propertiesXml += `
      </drmd:results>
    </drmd:properties>`;
        if (certified && standardUncRows.length > 0) {
            const n = standardUncRows.length;
            note('DATA-STANDARD-UNCERTAINTY', 'warning', 'Properties',
                `${propLabel}: ${n === 1 ? '1 certified value has' : `${n} certified values have`} an uncertainty without k and coverage probability, ` +
                `so ${n === 1 ? 'it is' : 'they are'} written as ${n === 1 ? 'a standard uncertainty' : 'standard uncertainties'} (si:standardMU). ` +
                `This is valid. If the certificate states a coverage factor (often in the text below the table, e.g. "k = 2"), enter k and P ` +
                `so that ${n === 1 ? 'it is' : 'they are'} written as expanded ${n === 1 ? 'uncertainty' : 'uncertainties'} instead.`);
        }
    });
    propertiesXml += `
  </drmd:propertiesList>`;

    // ---------------------------------------------------------------- statements
    // An empty statement is left out rather than written empty: an empty element would satisfy the
    // business rule for a mandatory statement (DRMD-004/005/006, RMC-001) without stating anything.
    const st = data.statements?.official || ({} as any);
    let statementsXml = `
  <drmd:statements>`;

    const addStatement = (tag: string, name: string, text: string) => {
        if (!notEmpty(text)) return '';
        return `
    <drmd:${tag}>
      <dcc:name>
        <dcc:content>${escapeXml(name)}</dcc:content>
      </dcc:name>
${content(text, '      ')}
    </drmd:${tag}>`;
    };

    statementsXml += addStatement("intendedUse", "Intended Use", st.intendedUse);
    statementsXml += addStatement("commutability", "Commutability", st.commutability);
    statementsXml += addStatement("storageInformation", "Storage Information", st.storageInformation);
    statementsXml += addStatement("instructionsForHandlingAndUse", "Handling Instructions", st.handlingInstructions);
    statementsXml += addStatement("metrologicalTraceability", "Metrological Traceability", st.metrologicalTraceability);
    statementsXml += addStatement("healthAndSafetyInformation", "Health And Safety Information", st.healthAndSafety);
    statementsXml += addStatement("subcontractors", "Subcontractors", st.subcontractors);
    statementsXml += addStatement("legalNotice", "Legal Notice", st.legalNotice);
    statementsXml += addStatement("referenceToCertificationReport", "Reference to Certification Report", st.referenceToCertificationReport);
    // Custom statements entered in the form (drmd:statement, repeatable)
    (data.statements?.custom || []).forEach(cs => {
        statementsXml += addStatement("statement", notEmpty(cs.name) || "Statement", cs.content);
    });

    statementsXml += `
  </drmd:statements>`;

    const placeholderFields = [
        ['Intended use', st.intendedUse], ['Storage information', st.storageInformation], ['Handling instructions', st.handlingInstructions],
        ['Metrological traceability', st.metrologicalTraceability],
        ...(data.materials || []).map((mat, i) => [`Description of material "${mat.name || i + 1}"`, mat.description]),
    ].filter(([, v]) => isPlaceholderText(v)).map(([label]) => label);
    if (placeholderFields.length > 0) {
        note('DATA-PLACEHOLDER', 'warning', 'Statements',
            `These fields still contain the placeholder "Information Not Available" (the AI found nothing in the PDF): ${placeholderFields.join(', ')}. ` +
            `They satisfy the schema but say nothing — check the certificate and replace them where the information exists.`);
    }

    // ---------------------------------------------------------------- comment and documents
    let extraXml = '';
    if (notEmpty(data.generalComment)) {
        extraXml += `
  <drmd:comment>${escapeXml(data.generalComment)}</drmd:comment>`;
    }
    if (options.includeDocuments !== false) {
        // The human-readable PDF of the RM document is written first and named as such, so that it can be
        // told apart from any other embedded file (drmd.xsd annotation of drmd:document; guidance document 7.3.1).
        const allDocs = data.binaryDocuments || [];
        const ordered = [...allDocs.filter(d => d.rmDocument), ...allDocs.filter(d => !d.rmDocument)];
        ordered.forEach((doc, i) => {
            const b64 = (doc.data || '').replace(/\s+/g, '');
            if (!b64) return;
            // Only base64 characters are written, so the content of an imported file cannot add XML elements.
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
                note('DATA-DOCUMENT', 'warning', 'Validation',
                    `The attached document "${notEmpty(doc.fileName) || i + 1}" is not valid base64 data, so it was left out of the XML.`);
                return;
            }
            // drmd:document is a dcc:byteDataType: name and description (optional) come first, then
            // fileName, mimeType and dataBase64 (required).
            const name = doc.rmDocument ? rmDocumentName(admin.title) : notEmpty(doc.name);
            const description = doc.rmDocument ? null : notEmpty(doc.description);
            extraXml += `
  <drmd:document>${name ? `
    <dcc:name>
${content(name, '      ')}
    </dcc:name>` : ''}${description ? `
    <dcc:description>
${content(description, '      ')}
    </dcc:description>` : ''}
    <dcc:fileName>${escapeXml(notEmpty(doc.fileName) || `document_${i + 1}.pdf`)}</dcc:fileName>
    <dcc:mimeType>${escapeXml(notEmpty(doc.mimeType) || 'application/pdf')}</dcc:mimeType>
    <dcc:dataBase64>${b64}</dcc:dataBase64>
  </drmd:document>`;
        });
    }

    const header = `<?xml version='1.0' encoding='utf-8'?>
<drmd:digitalReferenceMaterialDocument xmlns:dcc="https://ptb.de/dcc" xmlns:drmd="urn:drmd:schema" xmlns:si="https://ptb.de/si" schemaVersion="${DRMD_SCHEMA_VERSION}">`;
    const footer = `
</drmd:digitalReferenceMaterialDocument>`;
    const annotationsComment = options.includeAnnotations === false ? '' : generateAnnotationsComment(data);

    return {
        xml: header + adminXml + materialsXml + propertiesXml + statementsXml + extraXml + annotationsComment + footer,
        notes,
    };
};

export const generateDrmdXml = (data: DRMD): string => buildDrmdXml(data).xml;
