// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Extraction pipeline shared by single upload and bulk (folder) upload.
 *
 *   1. mapExtractedToDrmd()   — turns the model's JSON into a DRMD. Synchronous, no network.
 *   2. resolveIdentifiers()   — ROR / CAS / InChIKey look-ups (PubChem, ROR API, small Gemini
 *                               decisions). Bounded, cached across documents, quota-aware.
 *   3. applyIdentifierPatch() — merges step 2 into a document without overwriting user edits.
 *
 * Step 2 used to be part of step 1. For a typical multi-element certificate it fired ~20 extra
 * Gemini requests (one per element) before the form was allowed to show anything, and those
 * requests used up the per-minute quota that the NEXT certificate's extraction needed.
 */
import { countryNames } from '../utils/sourceForms';
import { DRMD, INITIAL_DRMD, INITIAL_PERSON, INITIAL_ID, ALLOWED_TITLES, Identifier } from '../types';
import { decideRorIdDetailed, decideChemicalIdentifiersDetailed, convertUnitsWithAi, UnitQuestion } from './llmService';
import { LlmConnection } from './providers';
import { convertToDSI } from '../utils/unitConverter';
import { toDsi, acceptAiUnit, dsiIdentifierList } from '../utils/dsi';
import { toXsdDate, findDateInText } from '../utils/xmlValues';
import { lookupChemicalIdentifiers, fetchWithTimeout } from '../utils/chemicalIdentifierService';

// Helper for UUIDs
export const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

/**
 * A fresh, fully independent empty document with its OWN unique identifier.
 * (The app used to write the identifier into the shared INITIAL_DRMD constant on start-up, so every
 * certificate extracted afterwards — every XML of a bulk run — carried the same uniqueIdentifier.)
 */
export const createInitialDrmd = (): DRMD => {
    const drmd = JSON.parse(JSON.stringify(INITIAL_DRMD)) as DRMD;
    drmd.administrativeData.uniqueIdentifier = generateUUID();
    return drmd;
};

const parseOriginalTexts = (raw: any): Record<string, string> | undefined => {
    if (!raw) return undefined;
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return undefined; }
    }
    return undefined;
};

// Shared mapping function: converts LLM extracted data into a full DRMD object.
// It is deliberately SYNCHRONOUS and makes no network calls, so extracted data reaches the form
// the moment the model answers. Identifier look-ups (ROR, CAS / InChIKey) are a separate step —
// see resolveIdentifiers() below — which used to run inside this function and kept the form
// blank until dozens of follow-up Gemini requests had finished.
// ---- Information that is not in the PDF stays empty ----
// A model sometimes writes "Not specified", "N/A" or "-" where the certificate says nothing. Such a
// value is not information: it would end up in the XML and the HTML report as if the certificate said
// it. So it is removed, and the field stays empty. An empty optional field is left out of the XML; an
// empty mandatory one is reported by the validation, for the user to fill in.
const ABSENT_VALUE = /^(?:n\/?a|none|nil|unknown|-+|–|—|\?|(?:information\s+)?not\s+(?:specified|stated|available|given|provided|found|mentioned|reported|indicated|listed|retrieved)(?:\s+in\s+the\s+(?:certificate|document|pdf))?\.?)$/i;
const SKIP_KEYS = new Set(['fieldCoordinates', 'sectionCoordinates', 'originalTexts', 'coverageReasoning']);
const withoutAbsentValues = (value: any): any => {
    if (typeof value === 'string') return ABSENT_VALUE.test(value.trim()) ? '' : value;
    if (Array.isArray(value)) return value.map(withoutAbsentValues);
    if (value && typeof value === 'object') {
        const out: any = {};
        for (const [k, v] of Object.entries(value)) out[k] = SKIP_KEYS.has(k) ? v : withoutAbsentValues(v);
        return out;
    }
    return value;
};

// ---- Country of a US address ----
// "Gaithersburg, MD 20899": a US state and a ZIP code show that the producer is in the United States,
// even where the certificate does not write the country. Used when the model left the country empty
// or gave one the address does not name.
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|PR|GU|VI';
const US_STATE_ZIP = new RegExp(`(?:^|[\\s,])((?:[A-Z][A-Za-z.'-]*\\s+)*[A-Z][A-Za-z.'-]*,?\\s+(?:${US_STATES})\\.?\\s+\\d{5}(?:-\\d{4})?)(?![\\d-])`);
export const usAddressIn = (text: string): string | null => {
    const m = (text || '').match(US_STATE_ZIP);
    return m ? m[1].trim() : null;
};

/** "Gaithersburg, MD 20899" in the certificate's own text, for the city the model gave. */
export const usAddressInPdf = (pdfText: string, city: string): string | null => {
    const c = (city || '').trim().replace(/,?\s+[A-Z]{2}$/, '');
    if (!pdfText || c.length < 2) return null;
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const m = pdfText.match(new RegExp(`(?:^|[^A-Za-z])(${esc},?\\s+(?:${US_STATES})\\.?\\s+\\d{5}(?:-\\d{4})?)(?![\\d-])`));
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
};

// ─────────────────────────────── Units: context and AI check ───────────────────────────────

type CtxQuantity = { name?: string; description?: string; method?: string };
type CtxResult = { name?: string; description?: string };
type CtxProperty = { name?: string; description?: string; procedures?: string };

/**
 * What the certificate says around a unit, closest first: the quantity, its table (name and
 * description), the property set (name, description, procedures) and the traceability statement.
 * The rules use it to tell what kind of fraction a ppb or ‰ is, and whether a bare "C" is a temperature.
 */
export const unitContextTexts = (q: CtxQuantity, r: CtxResult | undefined, p: CtxProperty | undefined, traceability?: string): string[] =>
    [q?.name, q?.description, q?.method, r?.name, r?.description, p?.name, p?.description, p?.procedures, traceability]
        .map(t => String(t ?? '').trim()).filter(Boolean);

const labelledContext = (q: CtxQuantity, r: CtxResult | undefined, p: CtxProperty | undefined): string[] => {
    const out: string[] = [];
    const add = (label: string, v?: string) => { const t = String(v ?? '').trim(); if (t) out.push(`${label}: ${t}`); };
    add('Quantity', q?.name); add('Quantity description', q?.description); add('Method', q?.method);
    add('Table', r?.name); add('Table description', r?.description);
    add('Property set', p?.name); add('Property set description', p?.description); add('Procedures', p?.procedures);
    return out;
};

export interface UnitPatch {
    [quantityUuid: string]: { unit: string; dsiUnit: string; dsiValue: string; dsiNote: string };
}

/**
 * Asks the AI about the units the rules cannot write on their own, with their context, and keeps only
 * the answers the rules confirm (acceptAiUnit). `only`: just these quantities (a unit typed in the form).
 */
type UnitGroup = { question: UnitQuestion; texts: string[]; quantities: Array<{ uuid: string; value: string }> };

/** The units to ask the AI about: those the rules cannot write on their own, one question per unit and table. */
const unitGroups = (drmd: DRMD, only?: string[]): UnitGroup[] => {
    const traceability = drmd.statements?.official?.metrologicalTraceability || '';
    const groups = new Map<string, UnitGroup>();
    drmd.properties.forEach(p => p.results.forEach(r => r.quantities.forEach(q => {
        if (only && !only.includes(q.uuid)) return;
        const unit = String(q.unit ?? '').trim();
        if (!unit || q.dsiSource === 'manual') return;
        const texts = unitContextTexts(q as CtxQuantity, r, p, traceability);
        const rules = toDsi(unit, { texts });
        if (rules.dsi && !rules.ambiguous) return; // written exactly by the rules: nothing to ask
        if (rules.noAi) return; // not a unit of the SI (hardness scale, cfu, dBm …): the AI cannot write it either
        const key = `${unit}\u0000${r.uuid}`;
        const g = groups.get(key);
        if (g) { g.quantities.push({ uuid: q.uuid, value: q.value }); return; }
        groups.set(key, {
            question: { id: `u${groups.size + 1}`, unit, context: labelledContext(q as CtxQuantity, r, p) },
            texts,
            quantities: [{ uuid: q.uuid, value: q.value }],
        });
    })));
    return Array.from(groups.values());
};

/** True when some unit of the document needs the AI (see unitGroups). */
export const needsUnitAi = (drmd: DRMD): boolean => unitGroups(drmd).length > 0;

export const refineUnitsWithAi = async (
    drmd: DRMD,
    conn: LlmConnection,
    options: { only?: string[]; patient?: boolean; manual?: boolean; doc?: string } = {},
): Promise<UnitPatch> => {
    const traceability = drmd.statements?.official?.metrologicalTraceability || '';
    const list = unitGroups(drmd, options.only);
    if (list.length === 0) return {};
    const answers = await convertUnitsWithAi(list.map(g => g.question), traceability, dsiIdentifierList(), conn, options);
    const patch: UnitPatch = {};
    for (const g of list) {
        const a = answers.find(x => x.id === g.question.id);
        if (!a) continue;
        const verdict = acceptAiUnit(g.question.unit, a, g.texts);
        if (!verdict.ok) {
            console.info(`[D-SI] AI answer for "${g.question.unit}" not used: ${verdict.reason}`);
            continue;
        }
        for (const q of g.quantities) {
            patch[q.uuid] = {
                unit: g.question.unit,
                dsiUnit: verdict.dsi,
                dsiValue: convertToDSI(q.value, '\\one').dsiValue,
                dsiNote: `${a.explanation}${verdict.kind ? ` (${verdict.kind} fraction: "${a.evidence}")` : ''}`.trim(),
            };
        }
    }
    return patch;
};

/** Applies AI units to the rows they were asked for, unless the unit or the D-SI unit was changed meanwhile. */
export const applyUnitPatch = (drmd: DRMD, patch: UnitPatch): DRMD => {
    if (Object.keys(patch).length === 0) return drmd;
    return {
        ...drmd,
        properties: drmd.properties.map(p => ({
            ...p,
            results: p.results.map(r => ({
                ...r,
                quantities: r.quantities.map(q => {
                    const u = patch[q.uuid];
                    if (!u || String(q.unit ?? '').trim() !== u.unit || q.dsiSource === 'manual') return q;
                    return { ...q, dsiUnit: u.dsiUnit, dsiValue: u.dsiValue, dsiSource: 'ai' as const, dsiNote: u.dsiNote };
                }),
            })),
        })),
    };
};

/**
 * `pdfText`: the certificate's text layer, when it could be read (see pdfPlainText). It is used to
 * check the producer's country against the address printed in the certificate.
 */
export const mapExtractedToDrmd = (rawExtracted: Partial<DRMD>, fileName: string, base64Content: string, pdfText = ''): DRMD => {
    const extractedData: Partial<DRMD> = withoutAbsentValues(rawExtracted);
    // Pre-processing: validity normalization
    if (extractedData?.administrativeData && extractedData.administrativeData.validityType === "Time After Dispatch") {
        // Number(): a value that arrives as text ("2") must not be joined as text ("24" + "6").
        const rawY = Number(extractedData.administrativeData.durationY) || 0;
        const rawM = Number(extractedData.administrativeData.durationM) || 0;
        const totalMonths = (rawY * 12) + rawM;
        if (totalMonths > 0) {
            extractedData.administrativeData.durationY = Math.floor(totalMonths / 12);
            extractedData.administrativeData.durationM = totalMonths % 12;
        }
    }
    // Dates must be plain YYYY-MM-DD. "09/2051" becomes the last day of that month, and when the AI
    // adds words to a date ("2051-09-30 Plugin text processing rule applied: …"), only the date
    // is kept. Anything that holds no date at all stays as it is and is shown as unreadable.
    const ad: any = extractedData?.administrativeData;
    if (ad) {
        for (const key of ['specificTime', 'dateOfIssue']) {
            if (typeof ad[key] !== 'string' || !ad[key].trim()) continue;
            const date = toXsdDate(ad[key]) || findDateInText(ad[key]);
            if (date) ad[key] = date;
        }
    }

    const prev = JSON.parse(JSON.stringify(INITIAL_DRMD)) as DRMD;

    // Document type (used below for the title)
    const determinedTitle = ALLOWED_TITLES.includes(extractedData?.administrativeData?.title as string)
        ? (extractedData?.administrativeData?.title as string)
        : "referenceMaterialCertificate";

    const newMats = (extractedData?.materials || []).map((m: any) => {
        const name = m.name || "";
        const sanitizeForId = (s: string) => s ? s.replace(/[^a-zA-Z0-9_-]/g, "_") : "unknown";
        return {
            ...m,
            uuid: generateUUID(),
            xmlId: `mat_${sanitizeForId(name)}`,
            materialIdentifiers: (m.materialIdentifiers && m.materialIdentifiers.length > 0)
                ? m.materialIdentifiers
                : [{...INITIAL_ID}],
            name: name,
            // Not in the PDF → empty (left out of the XML; the validation asks for what is mandatory).
            description: m.description || "",
            materialClass: m.materialClass || "",
            itemQuantities: m.itemQuantities || "",
            minimumSampleSize: m.minimumSampleSize || "",
            isCertified: !!m.isCertified,
            fieldCoordinates: m.fieldCoordinates,
            sectionCoordinates: m.sectionCoordinates,
            originalTexts: parseOriginalTexts(m.originalTexts)
        };
    });
    const normalizeName = (s: string) => s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

    const propertyMap: Record<string, any> = {};

    (extractedData?.properties || []).forEach((p: any) => {
        const propName = p.name || "Material Properties";
        const propKey = normalizeName(propName);
        if (!propertyMap[propKey]) {
            propertyMap[propKey] = { ...p, results: [] };
        }
        const propDesc = (p.description || "").trim();
        const isFootnote = propDesc.match(/^(\d+\)|1\)|\*)/);
        let resultDescPrefix = "";
        if (isFootnote) {
            resultDescPrefix = propDesc;
            propertyMap[propKey].description = "";
        }
        if (p.results) {
            if (resultDescPrefix && p.results.length > 0) {
                p.results[0].description = (p.results[0].description ? p.results[0].description + "\n" : "") + resultDescPrefix;
            }
            p.results.forEach((r: any) => {
                const rName = (r.name || "").toLowerCase().trim();
                const isFragment =
                    rName.includes("in mg/kg") ||
                    rName.includes("in %") ||
                    rName === "mg/kg" ||
                    rName === "%" ||
                    rName === "";
                const first = propertyMap[propKey].results[0];
                // Only merge a unit-header fragment (e.g. "in %", "in mg/kg") back into the
                // first table when it belongs to the SAME physical table — i.e. the same
                // lot/batch AND the same material. Tables that differ by lot/batch or material
                // are kept as SEPARATE result tables (each keeps its own footnotes/coverage).
                const sameBatch = first && ((first.linkedBatchLot || "").trim().toLowerCase() === (r.linkedBatchLot || "").trim().toLowerCase());
                const sameMaterial = first && ((first.linkedMaterialName || "").trim().toLowerCase() === (r.linkedMaterialName || "").trim().toLowerCase());
                if (first && isFragment && sameBatch && sameMaterial) {
                    if (r.quantities) {
                        if (!first.quantities) {
                            first.quantities = [];
                        }
                        first.quantities.push(...r.quantities);
                    }
                    if (r.description) {
                        first.description = (first.description || "") + "\n" + r.description;
                    }
                } else {
                    propertyMap[propKey].results.push(r);
                }
            });
        }
    });

    const traceability = String(extractedData?.statements?.official?.metrologicalTraceability || '');
    const newProps = Object.values(propertyMap).map((p: any) => {
        const finalResults = (p.results || []).map((r: any) => {
            const desc = (r.description || "").toLowerCase();
            const parentDesc = (p.description || "").toLowerCase();
            const getK = (s: string) => {
                const m = s.match(/k\s*=\s*(\d+(\.\d+)?)/i);
                return m ? m[1] : "";
            };
            const getProb = (s: string) => {
                const m1 = s.match(/(\d+(?:\.\d+)?)\s*%\s*confidence/i);
                if (m1) return m1[1];
                const m2 = s.match(/confidence.*?(\d+(?:\.\d+)?)\s*%/i);
                if (m2) return m2[1];
                return "";
            };
            let defaultK = getK(desc) || getK(parentDesc);
            let defaultProb = getProb(desc) || getProb(parentDesc);
            if (defaultK && !defaultProb) {
                const combined = desc + " " + parentDesc;
                const m3 = combined.match(/(\d+(?:\.\d+)?)\s*%/);
                if (m3) defaultProb = m3[1];
            }
            if (defaultProb) {
                const val = parseFloat(defaultProb);
                if (val > 1) defaultProb = (val / 100).toString();
            }
            const qs = (r.quantities || []).map((q: any) => {
                let finalValue = q.value || "";
                let finalUncertainty = q.uncertainty || "";
                if (!finalValue && finalUncertainty && (finalUncertainty.trim().startsWith('<') || finalUncertainty.trim().startsWith('>'))) {
                    finalValue = finalUncertainty;
                    finalUncertainty = "";
                }
                let finalK = q.coverageFactor || "";
                let finalProb = q.coverageProbability || "";
                if (!finalK && q.uncertainty && defaultK) finalK = defaultK;
                if (!finalProb && q.uncertainty && defaultProb) finalProb = defaultProb;
                let finalUnit = q.unit || "";
                if (!finalUnit.trim()) finalUnit = "\\one";
                // The rules of the D-SI guide, with what the certificate says around the unit
                const dsi = convertToDSI(finalValue, finalUnit, { texts: unitContextTexts({ name: q.name, description: q.description, method: q.method }, r, p, traceability) });
                return {
                    ...q,
                    uuid: generateUUID(),
                    identifiers: [{...INITIAL_ID}],
                    name: q.name || "",
                    value: finalValue,
                    unit: finalUnit,
                    uncertainty: finalUncertainty,
                    coverageFactor: finalK,
                    coverageProbability: finalProb,
                    distribution: q.distribution || "",
                    dsiValue: dsi.dsiValue,
                    dsiUnit: dsi.dsiUnit,
                    dsiSource: 'rules' as const,
                    fieldCoordinates: q.fieldCoordinates,
                    originalTexts: parseOriginalTexts(q.originalTexts)
                };
            });
            let finalMaterialRef = newMats.length === 1 ? newMats[0].uuid : undefined;

            // Priority 1: Match by linkedBatchLot → find material whose identifiers contain this batch/lot value
            if (r.linkedBatchLot && r.linkedBatchLot.trim()) {
                const batchVal = r.linkedBatchLot.trim().toLowerCase();
                // Same lot / batch schemes as the XML generator ("LOT", "Lot No.", "Batch no", "Charge").
                const batchMat = newMats.find((m: any) =>
                    (m.materialIdentifiers || []).some((id: any) =>
                        /^(lot|batch|lot\s*no\.?|batch\s*no\.?|charge)$/i.test(String(id.scheme || '').trim()) &&
                        id.value && String(id.value).trim().toLowerCase() === batchVal
                    )
                );
                if (batchMat) finalMaterialRef = batchMat.uuid;
            }

            // Priority 2: Match by linkedMaterialName (existing logic)
            if (!finalMaterialRef && newMats.length > 1 && String(r.linkedMaterialName || '').trim()) {
                // A material without a name is "contained" in every text, so it never matches.
                // The exact name wins; otherwise the most specific (longest) name that contains it or is contained in it.
                const linked = String(r.linkedMaterialName).trim().toLowerCase();
                const nameOf = (m: any) => String(m.name || '').trim().toLowerCase();
                const matchedMat = newMats.find((m: any) => nameOf(m) === linked)
                    || newMats
                        .filter((m: any) => { const name = nameOf(m); return !!name && (name.includes(linked) || linked.includes(name)); })
                        .sort((a: any, b: any) => nameOf(b).length - nameOf(a).length)[0];
                if (matchedMat) finalMaterialRef = matchedMat.uuid;
            }

            const finalName = r.name && r.name.length > 1 ? r.name : "Values";
            return {
                ...r,
                name: finalName,
                description: r.description || "",
                uuid: generateUUID(),
                materialRef: finalMaterialRef,
                quantities: qs,
                sectionCoordinates: r.sectionCoordinates,
                originalTexts: parseOriginalTexts(r.originalTexts)
            };
        });
        return {
            ...p,
            uuid: generateUUID(),
            name: p.name || "",
            description: p.description || "",
            procedures: p.procedures || "",
            isCertified: !!p.isCertified,
            // Auto-link property to material: use single material if only one exists,
            // otherwise try to infer from the first result's materialRef
            materialRef: newMats.length === 1
                ? newMats[0].uuid
                : (finalResults.find((r: any) => r.materialRef)?.materialRef || undefined),
            results: finalResults,
            originalTexts: parseOriginalTexts(p.originalTexts)
        };
    });

    // Post-processing: separate tables by MEASUREMENT METHOD while PRESERVING each table's
    // boundaries. We process every result (table) on its own:
    //   • A table whose rows all share one method (or none) stays a single table; its method
    //     goes to that property's 'procedures'.
    //   • A single table whose rows use DIFFERENT methods is split into one property per method
    //     (method A → its own table, method B → its own table, etc.).
    //   • Tables that were already separate in the PDF stay separate — each keeps its own name,
    //     description/footnotes, coverage reasoning, coordinates, and lot/batch → material link.
    // isCertified is inherited, so certified and informative tables remain in their sections.
    const stripMethod = (q: any) => { const { method: _m, ...rest } = q; return rest; };
    const finalProps: any[] = [];
    newProps.forEach((prop: any) => {
        const results = prop.results || [];
        const anyMethod = results.some((r: any) => (r.quantities || []).some((q: any) => q.method && q.method.trim()));

        if (!anyMethod) {
            // No per-row methods anywhere → keep the property and ALL its tables intact.
            finalProps.push(prop);
            return;
        }

        results.forEach((r: any) => {
            // Group THIS table's quantities by method, preserving first-seen order.
            const groups: Array<{ method: string; qs: any[] }> = [];
            const indexByMethod = new Map<string, number>();
            (r.quantities || []).forEach((q: any) => {
                const method = (q.method || "").trim();
                let gi = indexByMethod.get(method);
                if (gi === undefined) { gi = groups.length; indexByMethod.set(method, gi); groups.push({ method, qs: [] }); }
                groups[gi].qs.push(q);
            });

            if (groups.length <= 1) {
                // One (or no) method in this table → keep it as a single table.
                const method = groups[0]?.method || "";
                finalProps.push({
                    ...prop,
                    uuid: generateUUID(),
                    procedures: method || prop.procedures || "",
                    materialRef: r.materialRef || prop.materialRef,
                    results: [{ ...r, uuid: generateUUID(), quantities: (r.quantities || []).map(stripMethod) }]
                });
            } else {
                // Multiple methods within THIS table → one property per method, each keeping
                // this table's name/description/footnotes/coverage/coordinates/material link.
                groups.forEach(({ method, qs }) => {
                    finalProps.push({
                        ...prop,
                        uuid: generateUUID(),
                        procedures: method || prop.procedures || "",
                        materialRef: r.materialRef || prop.materialRef,
                        results: [{ ...r, uuid: generateUUID(), quantities: qs.map(stripMethod) }]
                    });
                });
            }
        });
    });


    // Normalize the certified flag per property/table. The model is inconsistent with
    // 'isCertified' and often marks informative/indicative tables as certified, which then
    // files them under the certified section of the DRMD. Which section a table came from is
    // stated in its own heading, so derive the flag from the property/table wording and only
    // fall back to the model's value when the wording says nothing either way.
    const decideCertified = (text: string): boolean | undefined => {
        if (/\b(non[-\s]?certified|not\s+certified|uncertified)\b/i.test(text)) return false;
        if (/\b(informative|indicative|additional\s+material\s+information|for\s+information\s+only|supplementary)\b/i.test(text)) return false;
        if (/\b(certified|certificate)\b/i.test(text)) return true;
        if (/\breference\s+values?\b/i.test(text)) return false;
        return undefined;
    };
    const isPIS = extractedData?.administrativeData?.title === 'productInformationSheet';
    finalProps.forEach((p: any) => {
        if (isPIS) { p.isCertified = false; return; }
        // Property name first, then the table names, then the description — the closest
        // heading wins, so a certified table inside a mixed section is not mislabelled.
        const candidates = [p.name, ...(p.results || []).map((r: any) => r.name), p.description];
        for (const text of candidates) {
            if (!text || !String(text).trim()) continue;
            const verdict = decideCertified(String(text));
            if (verdict !== undefined) { p.isCertified = verdict; return; }
        }
    });


    const newProds = (extractedData?.administrativeData?.producers || []).map((p: any) => {
        let countryCode = p.address?.countryCode || "";
        const city = p.address?.city || "";
        if (city.toLowerCase().includes("berlin") || city.toLowerCase().includes("adlershof")) {
            countryCode = "DE";
        }
        const originalTexts = parseOriginalTexts(p.originalTexts) || {};
        // A US address: "City, ST 12345" in what the model wrote, else in the certificate itself.
        const usAddress = usAddressIn(`${city} ${p.address?.postCode || ''}`) || usAddressIn([p.address?.street, p.address?.city, p.address?.postCode].filter(Boolean).join(', '))
            || usAddressInPdf(pdfText, city);
        // "Berlin, DE 12205, Germany": the given country is named right after the address in the
        // certificate, so "DE" there is the country, not the state of Delaware.
        const followedByCountry = (() => {
            if (!usAddress || !pdfText || !/^[A-Za-z]{2}$/.test(countryCode.trim())) return false;
            const at = pdfText.replace(/\s+/g, ' ').indexOf(usAddress);
            if (at < 0) return false;
            const after = pdfText.replace(/\s+/g, ' ').slice(at + usAddress.length, at + usAddress.length + 80).toLowerCase();
            return countryNames(countryCode).some(n => after.includes(n.toLowerCase()));
        })();
        if (usAddress && countryCode.toUpperCase() !== 'US' && !followedByCountry) {
            const addressText = [p.address?.street, p.address?.city, p.address?.postCode].join(' ').toLowerCase();
            const namedElsewhere = countryCode && countryNames(countryCode).some(n => addressText.includes(n.toLowerCase()));
            if (!namedElsewhere) {
                countryCode = 'US';
                originalTexts.countryCode = usAddress;
            }
        }

        return {
            ...p,
            uuid: generateUUID(),
            name: p.name || "",
            email: p.email || "",
            phone: p.phone || "",
            fax: p.fax || "",
            // Filled in by resolveIdentifiers() (ROR lookup) once the form is already showing.
            organizationIdentifiers: [{...INITIAL_ID}],
            address: {
                street: p.address?.street || "",
                streetNo: p.address?.streetNo || "",
                postCode: p.address?.postCode || "",
                city: p.address?.city || "",
                countryCode: countryCode
            },
            fieldCoordinates: p.fieldCoordinates,
            sectionCoordinates: p.sectionCoordinates,
            originalTexts: Object.keys(originalTexts).length ? originalTexts : undefined
        };
    });

    // Helper: split responsible persons whose names are still concatenated (safety net for LLM)
    const splitPersonSeparatorRegex = /\s+\/\s+|\s+&\s+|\s+and\s+/i;
    const rawPersons = (extractedData?.administrativeData?.responsiblePersons || []).map((p: any, index: number) => ({
        ...INITIAL_PERSON,
        uuid: generateUUID(),
        name: p.name || "",
        role: p.role || "",
        description: p.description || "",
        mainSigner: index === 0,
        fieldCoordinates: p.fieldCoordinates,
        sectionCoordinates: p.sectionCoordinates,
        originalTexts: parseOriginalTexts(p.originalTexts)
    }));

    // Post-processing: split combined names like "Dr. Smith / Prof. Garcia & Dr. Müller"
    const newPersons: any[] = [];
    rawPersons.forEach((person: any, personIndex: number) => {
        const nameParts = person.name.split(splitPersonSeparatorRegex).map((s: string) => s.trim()).filter((s: string) => s);
        const roleParts = person.role.split(splitPersonSeparatorRegex).map((s: string) => s.trim()).filter((s: string) => s);

        // Only split if we have multiple name parts AND the role count matches (or there's only 1 role for all)
        if (nameParts.length > 1 && (roleParts.length === nameParts.length || roleParts.length === 1)) {
            nameParts.forEach((name: string, i: number) => {
                newPersons.push({
                    ...INITIAL_PERSON,
                    uuid: generateUUID(),
                    name: name,
                    role: roleParts.length === nameParts.length ? roleParts[i] : roleParts[0],
                    description: person.description,
                    mainSigner: personIndex === 0 && i === 0,
                    // Share coordinates from the original combined entry
                    fieldCoordinates: person.fieldCoordinates,
                    sectionCoordinates: person.sectionCoordinates,
                    originalTexts: person.originalTexts
                });
            });
        } else {
            // No splitting needed — keep as-is
            newPersons.push(person);
        }
    });

    // Safeguard: the description must hold ADDITIONAL info (division, area of work), not a
    // copy of the role. If it just repeats the role/name, clear it so the field is empty.
    newPersons.forEach((person: any) => {
        const desc = (person.description || "").trim();
        const role = (person.role || "").trim();
        const name = (person.name || "").trim();
        if (desc && (desc.toLowerCase() === role.toLowerCase() || desc.toLowerCase() === name.toLowerCase())) {
            person.description = "";
        }
    });

    // Chemical identifiers (CAS / InChIKey) are resolved afterwards by resolveIdentifiers().

    let validType = prev.administrativeData.validityType;
    if (extractedData?.administrativeData?.validityType) {
        const vt = extractedData.administrativeData.validityType;
        if (vt === "Until Revoked" || vt === "Time After Dispatch" || vt === "Specific Time") {
            validType = vt;
        }
    }

    return {
        ...prev,
        administrativeData: {
            ...prev.administrativeData,
            uniqueIdentifier: extractedData?.administrativeData?.uniqueIdentifier || prev.administrativeData.uniqueIdentifier || generateUUID(),
            title: determinedTitle,
            documentVersion: extractedData?.administrativeData?.documentVersion || prev.administrativeData.documentVersion || "1.0",
            dataVersion: prev.administrativeData.dataVersion,
            validityType: validType,
            durationY: extractedData?.administrativeData?.durationY ?? prev.administrativeData.durationY,
            durationM: extractedData?.administrativeData?.durationM ?? prev.administrativeData.durationM,
            specificTime: extractedData?.administrativeData?.specificTime || prev.administrativeData.specificTime,
            dateOfIssue: extractedData?.administrativeData?.dateOfIssue || "",
            documentIdentifiers: [{ ...INITIAL_ID }],
            producers: newProds.length > 0 ? newProds : prev.administrativeData.producers,
            responsiblePersons: newPersons.length > 0 ? newPersons : prev.administrativeData.responsiblePersons,
            fieldCoordinates: extractedData?.administrativeData?.fieldCoordinates,
            originalTexts: parseOriginalTexts(extractedData?.administrativeData?.originalTexts)
        },
        statements: {
            ...prev.statements,
            official: {
                intendedUse: extractedData?.statements?.official?.intendedUse || "",
                commutability: extractedData?.statements?.official?.commutability || "",
                storageInformation: extractedData?.statements?.official?.storageInformation || "",
                handlingInstructions: extractedData?.statements?.official?.handlingInstructions || "",
                metrologicalTraceability: extractedData?.statements?.official?.metrologicalTraceability || "",
                healthAndSafety: extractedData?.statements?.official?.healthAndSafety || "",
                subcontractors: extractedData?.statements?.official?.subcontractors || "",
                legalNotice: extractedData?.statements?.official?.legalNotice || "",
                referenceToCertificationReport: extractedData?.statements?.official?.referenceToCertificationReport || "",
                fieldCoordinates: extractedData?.statements?.official?.fieldCoordinates,
                originalTexts: parseOriginalTexts((extractedData?.statements?.official as any)?.originalTexts)
            }
        },
        materials: newMats.length > 0 ? newMats : prev.materials,
        properties: finalProps.length > 0 ? finalProps : prev.properties,
        generalComment: "For additional information please refer to the pdf certificate",
        binaryDocuments: [{
            fileName: fileName,
            mimeType: "application/pdf",
            data: base64Content,
            // The certificate itself: the human-readable PDF of this DRMD
            rmDocument: true
        }]
    };
};

// ───────────────────────────── Identifier enrichment (ROR, CAS, InChIKey) ─────────────────────────────

/** Identifiers found for one document, keyed by the uuid of the producer / material / quantity. */
export interface IdentifierPatch {
    producers: Record<string, { forName: string; ids: Identifier[] }>;
    materials: Record<string, { forName: string; ids: Identifier[] }>;
    quantities: Record<string, { forName: string; ids: Identifier[] }>;
}

export interface EnrichmentOptions {
    /** Progress callback: done / total look-ups for this document. */
    onProgress?: (done: number, total: number) => void;
    /** After this long, remaining look-ups use the deterministic API data only (no model call). */
    llmDeadlineMs?: number;
    /** Called with each producer's ROR result as soon as it is known, so it can be shown at once. */
    onPartial?: (patch: IdentifierPatch) => void;
}

type ChemIds = { cas?: string; inchiKey?: string; pubchemCid?: string };

// Session caches. A folder of certificates from one producer repeats the same producer and the same
// elements over and over; each of those used to cost a fresh Gemini request per document.
// Only trustworthy results are kept ('final'); a look-up that had to fall back is retried next time.
const rorCache = new Map<string, Promise<{ rorId: string; final: boolean }>>();
const chemicalCache = new Map<string, Promise<{ ids: ChemIds; final: boolean; decided?: boolean }>>();

const cachedLookup = <T extends { final: boolean }>(cache: Map<string, Promise<T>>, key: string, compute: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = compute().then(
        result => { if (!result.final && cache.get(key) === pending) cache.delete(key); return result; },
        error => { if (cache.get(key) === pending) cache.delete(key); throw error; }
    );
    cache.set(key, pending);
    return pending;
};

// ROR answers in its v2 format (the unversioned address has served v2 since v1 was retired in
// December 2025). A v2 record carries much that does not help to recognise an organisation (admin
// dates, external ids, links), and twenty of them made the request to the model several times longer
// and slower. The model gets what it needs to compare: the names with their kinds, the type, the
// status, the places and the related organisations. v1 records are read as well.
const compactRorCandidate = (item: any) => {
    const names: { value: string; types: string[] }[] = Array.isArray(item?.names)
        ? item.names.map((n: any) => ({ value: String(n?.value || ''), types: Array.isArray(n?.types) ? n.types : [] }))
        : [
            ...(item?.name ? [{ value: String(item.name), types: ['ror_display'] }] : []),
            ...(item?.labels || []).map((l: any) => ({ value: String(l?.label || ''), types: ['label'] })),
            ...(item?.aliases || []).map((a: any) => ({ value: String(a || ''), types: ['alias'] })),
            ...(item?.acronyms || []).map((a: any) => ({ value: String(a || ''), types: ['acronym'] })),
        ];
    const locations = Array.isArray(item?.locations)
        ? item.locations.map((l: any) => ({
            city: l?.geonames_details?.name || '',
            country_code: l?.geonames_details?.country_code || '',
            country_name: l?.geonames_details?.country_name || '',
            country_subdivision_name: l?.geonames_details?.country_subdivision_name || '',
        }))
        : (item?.addresses || []).map((a: any) => ({
            city: a?.city || a?.geonames_city?.city || '',
            country_code: item?.country?.country_code || '',
            country_name: item?.country?.country_name || '',
            country_subdivision_name: a?.geonames_city?.geonames_admin1?.name || '',
        }));
    return {
        id: item?.id,
        names: names.filter(n => n.value),
        types: item?.types || [],
        status: item?.status,
        locations,
        relationships: (item?.relationships || []).map((r: any) => ({ type: r?.type, label: r?.label })),
    };
};

/**
 * A producer name that is, word for word, the name, a label or an alias of exactly one of the
 * organisations found (in the producer's country, when known) needs no model to decide. Acronyms are
 * not used: "BAM" or "JRC" stand for several organisations.
 */
const normName = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\u00a0]+/g, ' ').replace(/[.,;:]+$/, '').trim();
const exactRorMatch = (name: string, countryCode: string, candidates: ReturnType<typeof compactRorCandidate>[]): string => {
    const wanted = normName(name);
    if (!wanted) return '';
    const cc = (countryCode || '').trim().toUpperCase();
    const hits = candidates.filter(c =>
        c.status !== 'withdrawn'
        && c.names.some(n => !n.types.every(t => t === 'acronym') && normName(n.value) === wanted)
        && (!cc || c.locations.some((l: any) => String(l.country_code).toUpperCase() === cc)));
    return hits.length === 1 ? String(hits[0].id || '') : '';
};

const resolveRor = (name: string, city: string, countryCode: string, conn: LlmConnection, skipLlm: boolean, manual = false) =>
    cachedLookup(rorCache, `${name}|${city}|${countryCode}`.toLowerCase(), async () => {
        try {
            // Escape Elasticsearch reserved characters in the name
            const escapeName = (s: string) => s.replace(/[+\-=&|!(){}[\]^"~*?:\\/]/g, (c) => `\\${c}`);
            const safeName = escapeName(name);
            const countryFilter = countryCode ? `&filter=country.country_code:${countryCode}` : '';

            // Strategy: two queries to maximize coverage
            // 1. Unquoted query (broader, word-based matching) with country filter
            const url1 = `https://api.ror.org/organizations?query=${encodeURIComponent(safeName)}${countryFilter}`;
            // 2. Quoted query (exact phrase matching) with country filter
            const url2 = `https://api.ror.org/organizations?query=${encodeURIComponent(`"${safeName}"`)}${countryFilter}`;

            const [res1, res2] = await Promise.all([fetchWithTimeout(url1), fetchWithTimeout(url2)]);

            // Collect candidates from both queries, deduplicated by ID
            const seenIds = new Set<string>();
            const allCandidates: any[] = [];

            // The quoted (exact phrase) results first: they are the likeliest matches.
            for (const res of [res2, res1]) {
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.items) {
                        for (const item of data.items.slice(0, 10)) {
                            if (item.id && !seenIds.has(item.id)) {
                                seenIds.add(item.id);
                                allCandidates.push(item);
                            }
                        }
                    }
                }
            }

            if (allCandidates.length > 0) {
                // Pass up to 10 unique candidates to the AI for evaluation
                const offered = allCandidates.slice(0, 10).map(compactRorCandidate);
                // Only an ID of one of the offered organisations is accepted, written bare ("03x516a66"),
                // even if the answer came back as a full https://ror.org/… link.
                const bareId = (v: unknown) => String(v || '').trim().replace(/^https?:\/\/(www\.)?ror\.org\//i, '').replace(/\/+$/, '');
                const exact = exactRorMatch(name, countryCode, offered);
                if (exact) return { rorId: bareId(exact), final: true };
                const decision = await decideRorIdDetailed(name, city, countryCode, offered, conn, { skipLlm, manual });
                const chosen = bareId(decision.rorId);
                const rorId = chosen && offered.some(c => bareId(c.id) === chosen) ? chosen : '';
                if (chosen && !rorId) console.warn(`ROR answer "${decision.rorId}" for "${name}" is not one of the organisations found, so it was not used.`);
                return { rorId, final: decision.decidedBy !== 'fallback' };
            }
            return { rorId: '', final: res1.ok && res2.ok };
        } catch (e) {
            console.error("ROR API / LLM decision error:", e);
            return { rorId: '', final: false };
        }
    });

/**
 * The key a substance name is looked up and cached under. Short names are element symbols or
 * formulas, where the case carries the meaning (Co is cobalt, CO carbon monoxide; No is nobelium,
 * NO nitric oxide), so they keep it; longer names are compared without case.
 */
export const chemKey = (name?: string) => {
    const n = (name || '').trim();
    return n.length <= 3 ? n : n.toLowerCase();
};

const resolveChemical = (name: string, context: string, conn: LlmConnection, skipLlm: boolean, manual = false) =>
    cachedLookup(chemicalCache, `${chemKey(name)}|${context}`, async () => {
        const apiResults = await lookupChemicalIdentifiers(name);
        const decision = await decideChemicalIdentifiersDetailed(name, context, apiResults, conn, { skipLlm, manual });
        // Only cache when PubChem actually answered — a transient PubChem failure should be retried.
        const pubchemAnswered = !!(apiResults.inchiKey || apiResults.pubchemCid);
        return { ids: decision.identifiers, final: decision.decidedBy !== 'fallback' && pubchemAnswered, decided: decision.decidedBy !== 'fallback' };
    });

/**
 * Looks up ROR IDs for producers and CAS / InChIKey identifiers for materials and measured
 * quantities — the same look-ups, prompts and rules as before, now run AFTER the form is populated.
 * Never throws: anything that cannot be resolved simply keeps its empty identifier row.
 */
export const resolveIdentifiers = async (drmd: DRMD, conn: LlmConnection, options: EnrichmentOptions = {}): Promise<IdentifierPatch> => {
    const patch: IdentifierPatch = { producers: {}, materials: {}, quantities: {} };
    const startedAt = Date.now();
    const pastDeadline = () => options.llmDeadlineMs !== undefined && Date.now() - startedAt > options.llmDeadlineMs;

    // Same chemical list, same order, same context strings as the original in-line code.
    const uniqueChemicals = new Map<string, { name: string; context: string }>();
    drmd.properties.forEach(p => {
        p.results.forEach(r => {
            r.quantities.forEach(q => {
                if (chemKey(q.name) && !uniqueChemicals.has(chemKey(q.name))) {
                    uniqueChemicals.set(chemKey(q.name), { name: q.name.trim(), context: 'Property Quantity' });
                }
            });
        });
    });
    drmd.materials.forEach(m => {
        if (chemKey(m.name) && !uniqueChemicals.has(chemKey(m.name))) {
            // Use the material name AND its description (if any) as context, so the AI can
            // resolve a chemical identity from richer information — same lookup used for
            // property elements, applied to the material.
            const desc = (m.description || "").trim();
            const context = desc
                ? `Reference material named "${m.name}". Description: ${desc}`
                : `Reference material named "${m.name}".`;
            uniqueChemicals.set(chemKey(m.name), { name: m.name.trim(), context });
        }
    });

    const producers = drmd.administrativeData.producers.filter(p => p.name);
    const total = producers.length + uniqueChemicals.size;
    let done = 0;
    const tick = () => options.onProgress?.(++done, total);
    options.onProgress?.(0, total);

    // 1. Producers → ROR
    await Promise.all(producers.map(async p => {
        const { rorId } = await resolveRor(p.name, p.address?.city || "", p.address?.countryCode || "", conn, pastDeadline());
        patch.producers[p.uuid] = {
            forName: p.name,
            ids: rorId
                ? [{ scheme: 'ROR', value: rorId, link: `https://ror.org/${rorId}` }]
                : [{ ...INITIAL_ID }],
        };
        if (rorId) options.onPartial?.({ producers: { [p.uuid]: patch.producers[p.uuid] }, materials: {}, quantities: {} });
        tick();
    }));

    // 2. Chemicals → CAS / InChIKey, with LIMITED CONCURRENCY. Firing every lookup at once
    // overwhelms PubChem's rate limit (~5 requests/sec) and a chunk of them silently
    // fail (503), which is why some elements came back with no CAS/InChIKey. A small
    // pool keeps us under the limit while still being reasonably fast.
    const resolvedChemicals = new Map<string, ChemIds>();
    {
        const chemList = Array.from(uniqueChemicals.values());
        const CONCURRENCY = 3;
        let cursor = 0;
        const worker = async () => {
            while (cursor < chemList.length) {
                const chem = chemList[cursor++];
                try {
                    const { ids } = await resolveChemical(chem.name, chem.context, conn, pastDeadline());
                    resolvedChemicals.set(chemKey(chem.name), ids);
                } catch (e) {
                    console.warn(`Identifier resolution failed for "${chem.name}":`, e);
                }
                tick();
            }
        };
        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, chemList.length) }, () => worker())
        );
    }

    // 3. Same assignment rules as before: quantities get [CAS, InChIKey] (or the empty row);
    //    materials get CAS / InChIKey appended to their existing identifiers (lot/batch etc.).
    drmd.properties.forEach(p => {
        p.results.forEach(r => {
            r.quantities.forEach(q => {
                const resolved = resolvedChemicals.get(chemKey(q.name));
                if (resolved) {
                    const ids: Identifier[] = [];
                    if (resolved.cas) {
                        ids.push({ scheme: 'CAS', value: resolved.cas, link: `https://commonchemistry.cas.org/detail?cas_rn=${resolved.cas}` });
                    }
                    if (resolved.inchiKey) {
                        ids.push({ scheme: 'InChIKey', value: resolved.inchiKey, link: resolved.pubchemCid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${resolved.pubchemCid}` : '' });
                    }
                    if (ids.length === 0) {
                        ids.push({ ...INITIAL_ID });
                    }
                    patch.quantities[q.uuid] = { forName: q.name, ids };
                }
            });
        });
    });
    drmd.materials.forEach(m => {
        const resolved = resolvedChemicals.get(chemKey(m.name));
        if (resolved) {
            const ids: Identifier[] = [];
            if (resolved.cas) {
                ids.push({ scheme: 'CAS', value: resolved.cas, link: `https://commonchemistry.cas.org/detail?cas_rn=${resolved.cas}` });
            }
            if (resolved.inchiKey) {
                ids.push({ scheme: 'InChIKey', value: resolved.inchiKey, link: resolved.pubchemCid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${resolved.pubchemCid}` : '' });
            }
            if (ids.length > 0) patch.materials[m.uuid] = { forName: m.name, ids };
        }
    });

    return patch;
};

// ───────────────────────────── Look-ups on request ─────────────────────────────
// The buttons next to the identifier fields run the same look-ups, prompts and rules as the automatic
// enrichment above, for one producer, one material or the rows of one table. They always ask again
// (the session cache is bypassed), because the user wants a fresh check, e.g. after correcting a name.

const chemicalIdentifiersFrom = (resolved: ChemIds): Identifier[] => {
    const ids: Identifier[] = [];
    if (resolved.cas) ids.push({ scheme: 'CAS', value: resolved.cas, link: `https://commonchemistry.cas.org/detail?cas_rn=${resolved.cas}` });
    if (resolved.inchiKey) ids.push({ scheme: 'InChIKey', value: resolved.inchiKey, link: resolved.pubchemCid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${resolved.pubchemCid}` : '' });
    return ids;
};

/** The context string the automatic look-up uses for a material. */
export const materialLookupContext = (name: string, description?: string) => {
    const desc = (description || "").trim();
    return desc ? `Reference material named "${name}". Description: ${desc}` : `Reference material named "${name}".`;
};

/** ROR ID for one producer. `complete` is false when ROR or the AI could not be reached. */
export const lookUpRorAgain = async (name: string, city: string, countryCode: string, conn: LlmConnection): Promise<{ rorId: string; complete: boolean }> => {
    rorCache.delete(`${name}|${city}|${countryCode}`.toLowerCase());
    const { rorId, final } = await resolveRor(name, city, countryCode, conn, false, true);
    return { rorId, complete: final || !!rorId };
};

/**
 * Whether PubChem answered for this name at all (found, or "not found"), as opposed to being
 * unreachable or busy. An empty result only counts as "nothing found" when PubChem answered.
 */
const pubchemAnswers = async (name: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetchWithTimeout(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name.trim())}/cids/JSON`, 10000);
            if (res.status !== 429 && res.status < 500) return true;
        } catch { /* not reachable: try once more */ }
        await new Promise(r => setTimeout(r, 800));
    }
    return false;
};

/**
 * CAS / InChIKey for one substance. `complete` is true when the check could be made: the AI decided
 * and PubChem answered. Then `ids` is the full answer, and an empty list means none exists.
 */
export const lookUpChemicalAgain = async (name: string, context: string, conn: LlmConnection): Promise<{ ids: Identifier[]; complete: boolean }> => {
    chemicalCache.delete(`${chemKey(name)}|${context}`);
    try {
        const { ids, final, decided = false } = await resolveChemical(name, context, conn, false, true);
        const found = chemicalIdentifiersFrom(ids);
        // An InChIKey only comes from PubChem, so it shows that PubChem answered.
        const complete = final || (decided && (found.some(id => id.scheme === 'InChIKey') || await pubchemAnswers(name)));
        return { ids: found, complete };
    } catch (e) {
        console.warn(`Identifier look-up failed for "${name}":`, e);
        return { ids: [], complete: false };
    }
};

/** CAS / InChIKey for the rows of one table, by row name (see chemKey). Same small pool as the automatic look-up. */
export const lookUpChemicalsAgain = async (
    names: string[], conn: LlmConnection, onProgress?: (done: number, total: number) => void
): Promise<Map<string, { ids: Identifier[]; complete: boolean }>> => {
    const unique = Array.from(new Map(names.filter(n => n && n.trim()).map(n => [chemKey(n), n.trim()])).values());
    const out = new Map<string, { ids: Identifier[]; complete: boolean }>();
    let cursor = 0, done = 0;
    onProgress?.(0, unique.length);
    const worker = async () => {
        while (cursor < unique.length) {
            const name = unique[cursor++];
            out.set(chemKey(name), await lookUpChemicalAgain(name, 'Property Quantity', conn));
            onProgress?.(++done, unique.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, unique.length) }, () => worker()));
    return out;
};

const isEmptyIdentifierList = (ids?: Identifier[]) =>
    !ids || ids.length === 0 || ids.every(i => !(i.scheme || "").trim() && !(i.value || "").trim());
const sameName = (a?: string, b?: string) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();

/**
 * Merges looked-up identifiers into a document. Matching is by uuid AND by the name the look-up was
 * made for, and only empty identifier rows are filled — so it is a no-op on a different document,
 * and it never overwrites anything the user typed or renamed while the look-up was running.
 */
export const applyIdentifierPatch = (drmd: DRMD, patch: IdentifierPatch): DRMD => ({
    ...drmd,
    administrativeData: {
        ...drmd.administrativeData,
        producers: drmd.administrativeData.producers.map(p => {
            const hit = patch.producers[p.uuid];
            return hit && sameName(hit.forName, p.name) && isEmptyIdentifierList(p.organizationIdentifiers)
                ? { ...p, organizationIdentifiers: hit.ids }
                : p;
        }),
    },
    materials: drmd.materials.map(m => {
        const hit = patch.materials[m.uuid];
        if (!hit || chemKey(hit.forName) !== chemKey(m.name) || m.identifiersEdited) return m;
        const existing = m.materialIdentifiers || [];
        const fresh = hit.ids.filter(a => !existing.some(e => e.scheme === a.scheme && e.value === a.value));
        return fresh.length > 0 ? { ...m, materialIdentifiers: [...existing, ...fresh] } : m;
    }),
    properties: drmd.properties.map(p => ({
        ...p,
        results: p.results.map(r => ({
            ...r,
            quantities: r.quantities.map(q => {
                const hit = patch.quantities[q.uuid];
                return hit && chemKey(hit.forName) === chemKey(q.name) && !q.identifiersEdited && isEmptyIdentifierList(q.identifiers)
                    ? { ...q, identifiers: hit.ids }
                    : q;
            }),
        })),
    })),
});
