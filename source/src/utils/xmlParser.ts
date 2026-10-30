// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import { safeHttpUrl } from "./safeUrl";
import { toXsdDate } from "./xmlValues";


import { 
    DRMD, INITIAL_DRMD, INITIAL_PRODUCER, INITIAL_PERSON, INITIAL_QUANTITY, INITIAL_ID,
    Producer, ResponsiblePerson, Material, MaterialProperty, MeasurementResult, Quantity, BinaryDocument, isRmDocumentName, isPdfDocument
} from "../types";

const getTagContent = (parent: Element | Document, tagName: string): string => {
    const el = parent.getElementsByTagName(tagName)[0];
    return el?.textContent || "";
};

const getNestedContent = (parent: Element, path: string[]): string => {
    let current: Element = parent;
    for (const tag of path) {
        const elements = current.getElementsByTagName(tag);
        if (elements.length === 0) return "";
        current = elements[0];
    }
    return current.textContent || "";
};

// Direct children only — getElementsByTagName would also match the same tag deeper in the tree.
const childElements = (parent: Element, tagName: string): Element[] =>
    Array.from(parent.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).tagName === tagName);

const isLotScheme = (scheme?: string) => /^(lot|batch|lot\s*no\.?|batch\s*no\.?|charge)$/i.test((scheme || '').trim());

// The parser looks elements up by their usual names (drmd:…, dcc:…, si:…). A file may bind the same
// namespaces to other prefixes, or use a default namespace; such a file is rewritten with the usual
// prefixes first, so it imports exactly like one written by this app.
const PREFIX_OF: Record<string, string> = {
    'urn:drmd:schema': 'drmd',
    'https://ptb.de/dcc': 'dcc',
    'https://ptb.de/si': 'si',
};
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const withUsualPrefixes = (doc: Document): Document => {
    const all = Array.from(doc.getElementsByTagName('*'));
    if (all.every(el => !el.namespaceURI || !PREFIX_OF[el.namespaceURI] || el.prefix === PREFIX_OF[el.namespaceURI])) return doc;
    const out = doc.implementation.createDocument(null, null, null);
    const copy = (node: Node): Node | null => {
        if (node.nodeType === 1) {
            const el = node as Element;
            const prefix = el.namespaceURI ? PREFIX_OF[el.namespaceURI] : undefined;
            const clone = prefix
                ? out.createElementNS(el.namespaceURI, `${prefix}:${el.localName}`)
                : out.createElementNS(el.namespaceURI, el.nodeName);
            for (const attr of Array.from(el.attributes)) {
                if (attr.namespaceURI === XMLNS) continue; // declarations are added again when serialised
                clone.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
            }
            el.childNodes.forEach(child => { const c = copy(child); if (c) clone.appendChild(c); });
            return clone;
        }
        if (node.nodeType === 3 || node.nodeType === 4) return out.createTextNode(node.nodeValue || '');
        if (node.nodeType === 8) return out.createComment(node.nodeValue || '');
        return null;
    };
    const root = copy(doc.documentElement);
    if (root) out.appendChild(root);
    return out;
};

/**
 * Reads a DRMD XML file back into the form. Understands the schema-valid layout this app writes
 * (DRMD 1.0.0: si:/dcc: quantities, material links through materialIdentifier/@id, dcc:byteDataType
 * documents) and the layout earlier versions of the app wrote (drmd:real, material/@id, lot_* ids,
 * raw base64 in drmd:document), so previously exported files still import.
 */
export const parseDrmdXml = (xmlString: string): DRMD => {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(xmlString, "text/xml");
    
    // Check for parse errors
    const errorNode = parsed.querySelector("parsererror");
    if (errorNode) {
        throw new Error("Invalid XML file structure");
    }
    // Any other XML file would otherwise open as an empty form without a word.
    if (parsed.documentElement?.localName !== "digitalReferenceMaterialDocument") {
        throw new Error("This XML file is not a DRMD (its root element is not digitalReferenceMaterialDocument)");
    }
    const doc = withUsualPrefixes(parsed);

    const data: DRMD = JSON.parse(JSON.stringify(INITIAL_DRMD));

    // Helper for UUIDs
    const uuid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    // --- Administrative Data ---
    const admin = doc.getElementsByTagName("drmd:administrativeData")[0];
    if (admin) {
        const core = admin.getElementsByTagName("drmd:coreData")[0];
        if (core) {
            data.administrativeData.title = getNestedContent(core, ["drmd:titleOfTheDocument"]);
            data.administrativeData.uniqueIdentifier = getNestedContent(core, ["drmd:uniqueIdentifier"]);
            data.administrativeData.documentVersion = getNestedContent(core, ["drmd:documentVersion"]) || "1.0";
            const docIds = core.getElementsByTagName("drmd:documentIdentifier");
            if (docIds.length > 0) {
                data.administrativeData.documentIdentifiers = Array.from(docIds).map(di => ({
                    scheme: getNestedContent(di, ["drmd:scheme"]),
                    value: getNestedContent(di, ["drmd:value"]),
                    link: safeHttpUrl(getNestedContent(di, ["drmd:link"]))
                }));
            }
            
            // Validity
            const validity = core.getElementsByTagName("drmd:validity")[0];
            if (validity) {
                if (validity.getElementsByTagName("drmd:untilRevoked").length > 0) {
                    data.administrativeData.validityType = "Until Revoked";
                } else if (validity.getElementsByTagName("drmd:specificTime").length > 0) {
                    data.administrativeData.validityType = "Specific Time";
                    const until = getNestedContent(validity, ["drmd:specificTime"]);
                    data.administrativeData.specificTime = toXsdDate(until) || until;
                } else if (validity.getElementsByTagName("drmd:timeAfterDispatch").length > 0) {
                    data.administrativeData.validityType = "Time After Dispatch";
                    const tad = validity.getElementsByTagName("drmd:timeAfterDispatch")[0];
                    const period = getNestedContent(tad, ["drmd:period"]); // e.g. P1Y
                    const date = getNestedContent(tad, ["drmd:dispatchDate"]);
                    
                    data.administrativeData.dateOfIssue = toXsdDate(date) || date;
                    
                    // Parse Period PnYnM
                    const y = period.match(/(\d+)Y/);
                    const m = period.match(/(\d+)M/);
                    data.administrativeData.durationY = y ? parseInt(y[1]) : 0;
                    data.administrativeData.durationM = m ? parseInt(m[1]) : 0;
                }
            }
        }

        // Producers
        const producers = admin.getElementsByTagName("drmd:referenceMaterialProducer");
        if (producers.length > 0) {
            data.administrativeData.producers = Array.from(producers).map(p => {
                const prod: Producer = { ...INITIAL_PRODUCER, uuid: uuid(), address: { ...INITIAL_PRODUCER.address }, organizationIdentifiers: INITIAL_PRODUCER.organizationIdentifiers.map(id => ({ ...id })) };
                // Name structure: <drmd:name><dcc:content>Name</dcc:content></drmd:name>
                prod.name = getNestedContent(p, ["drmd:name", "dcc:content"]);
                
                const contact = p.getElementsByTagName("drmd:contact")[0];
                if (contact) {
                    prod.email = getNestedContent(contact, ["dcc:eMail"]);
                    prod.phone = getNestedContent(contact, ["dcc:phone"]);
                    prod.fax = getNestedContent(contact, ["dcc:fax"]);
                    
                    const loc = contact.getElementsByTagName("dcc:location")[0];
                    if (loc) {
                        prod.address.street = getNestedContent(loc, ["dcc:street"]);
                        prod.address.streetNo = getNestedContent(loc, ["dcc:streetNo"]);
                        prod.address.postCode = getNestedContent(loc, ["dcc:postCode"]);
                        prod.address.city = getNestedContent(loc, ["dcc:city"]);
                        prod.address.countryCode = getNestedContent(loc, ["dcc:countryCode"]);
                        if (!prod.address.countryCode) {
                            const further = getNestedContent(loc, ["dcc:further", "dcc:content"]);
                            const m = further.match(/^Country:\s*(.+)$/);
                            if (m) prod.address.countryCode = m[1].trim();
                        }
                    }
                }

                // Organization Identifiers (e.g. ROR)
                const orgIds = p.getElementsByTagName("drmd:organizationIdentifier");
                if (orgIds.length > 0) {
                    prod.organizationIdentifiers = Array.from(orgIds).map(oi => ({
                        scheme: getNestedContent(oi, ["drmd:scheme"]),
                        value: getNestedContent(oi, ["drmd:value"]),
                        link: safeHttpUrl(getNestedContent(oi, ["drmd:link"]))
                    }));
                }

                return prod;
            });
        }

        // Responsible Persons
        const persons = admin.getElementsByTagName("dcc:respPerson");
        if (persons.length > 0) {
            data.administrativeData.responsiblePersons = Array.from(persons).map(p => {
                const per: ResponsiblePerson = { ...INITIAL_PERSON, uuid: uuid() };
                per.name = getNestedContent(p, ["dcc:person", "dcc:name", "dcc:content"]);
                per.description = getNestedContent(p, ["dcc:description", "dcc:content"]);
                per.role = getTagContent(p, "dcc:role");
                per.mainSigner = getTagContent(p, "dcc:mainSigner") === "true";
                per.cryptElectronicSeal = getTagContent(p, "dcc:cryptElectronicSeal") === "true";
                per.cryptElectronicSignature = getTagContent(p, "dcc:cryptElectronicSignature") === "true";
                per.cryptElectronicTimeStamp = getTagContent(p, "dcc:cryptElectronicTimeStamp") === "true";
                return per;
            });
        }
    }

    // --- Materials ---
    // materialIdentifier/@id → its material (and whether it is a lot/batch number). Properties blocks
    // and results link to materials through these ids (drmd:material itself has no @id).
    const idTargets = new Map<string, { materialUuid: string; isLot: boolean; value: string }>();
    const materials = doc.getElementsByTagName("drmd:material");
    if (materials.length > 0) {
        data.materials = Array.from(materials).map(m => {
            // Files written by earlier versions put an id on <drmd:material> (not allowed by the schema)
            let xmlId = m.getAttribute("id") || "";

            const mat: Material = {
                uuid: uuid(),
                xmlId,
                name: getNestedContent(m, ["drmd:name", "dcc:content"]),
                description: getNestedContent(m, ["drmd:description", "dcc:content"]),
                materialClass: "",
                minimumSampleSize: "",
                itemQuantities: "",
                isCertified: false,
                rmCode: "",
                materialIdentifiers: [{...INITIAL_ID}]
            };

            const parseQty = (tagName: string) => {
                const container = m.getElementsByTagName(tagName)[0];
                if (!container) return "";
                const itemQ = container.getElementsByTagName("dcc:itemQuantity")[0];
                if (!itemQ) return "";
                
                // Value + unit (si:real; drmd:real in files from earlier versions)
                const real = itemQ.getElementsByTagName("si:real")[0] || itemQ.getElementsByTagName("drmd:real")[0];
                if (real) {
                    const val = getNestedContent(real, ["si:value"]);
                    const unit = getNestedContent(real, ["si:unit"]);
                    return `${val} ${unit}`.trim();
                }
                // Text (dcc:noQuantity; drmd:noQuantity in files from earlier versions)
                const noQ = itemQ.getElementsByTagName("dcc:noQuantity")[0] || itemQ.getElementsByTagName("drmd:noQuantity")[0];
                if (noQ) {
                    return getNestedContent(noQ, ["dcc:content"]);
                }
                return "";
            };

            mat.minimumSampleSize = parseQty("drmd:minimumSampleSize");
            mat.itemQuantities = parseQty("drmd:itemQuantities");

            const matIdsNode = m.getElementsByTagName("drmd:materialIdentifiers")[0];
            if (matIdsNode) {
                const matIds = matIdsNode.getElementsByTagName("drmd:materialIdentifier");
                if (matIds.length > 0) {
                    mat.materialIdentifiers = Array.from(matIds).map(mi => {
                        const id = {
                            scheme: getNestedContent(mi, ["drmd:scheme"]),
                            value: getNestedContent(mi, ["drmd:value"]),
                            link: safeHttpUrl(getNestedContent(mi, ["drmd:link"]))
                        };
                        const xmlIdAttr = mi.getAttribute("id");
                        if (xmlIdAttr) idTargets.set(xmlIdAttr, { materialUuid: mat.uuid, isLot: isLotScheme(id.scheme), value: id.value });
                        return id;
                    });
                    
                    // The RM code is written as the catalogNumber identifier. It goes into the RM code field
                    // only — kept in the list as well, a corrected RM code would be exported next to the old one.
                    const catalogId = mat.materialIdentifiers.find(id => id.scheme === 'catalogNumber');
                    if (catalogId) {
                        mat.rmCode = catalogId.value;
                        mat.materialIdentifiers = mat.materialIdentifiers.filter(id => id !== catalogId);
                        if (!mat.materialIdentifiers.some(id => !/^(cas|inchikey)$/i.test((id.scheme || '').trim()))) {
                            mat.materialIdentifiers.unshift({ ...INITIAL_ID }); // the editable Batch / Lot row
                        }
                    }
                }
            }

            return mat;
        });
    }

    // --- Properties ---
    const props = doc.getElementsByTagName("drmd:properties");
    if (props.length > 0) {
        data.properties = Array.from(props).map(p => {
            // Resolve an IDREFS list to a material uuid and a lot/batch value.
            const resolveRefs = (refIdStr: string | null) => {
                let materialUuid = "";
                let lot: string | undefined = undefined;
                for (const ref of (refIdStr || "").split(/\s+/).filter(Boolean)) {
                    const target = idTargets.get(ref);
                    if (target) {
                        if (target.isLot) { lot = target.value; materialUuid = materialUuid || target.materialUuid; }
                        else materialUuid = target.materialUuid;
                        continue;
                    }
                    // Files from earlier versions: <drmd:material id="mat_..."> and lot_<value> ids
                    const legacyMat = data.materials.find(m => m.xmlId && m.xmlId === ref);
                    if (legacyMat) materialUuid = legacyMat.uuid;
                    if (ref.startsWith("lot_")) lot = ref.substring(4);
                }
                return { materialUuid, lot };
            };
            const blockRef = resolveRefs(p.getAttribute("refId"));

            // Every method of the block, not only the first (files from other tools may list several).
            const procNode = childElements(p, "drmd:procedures")[0];
            const methods = Array.from((procNode || p).getElementsByTagName("dcc:usedMethod")).map(m => {
                const nameEl = childElements(m, "dcc:name")[0];
                const descEl = childElements(m, "dcc:description")[0];
                const name = nameEl ? getNestedContent(nameEl, ["dcc:content"]).trim() : "";
                const desc = descEl ? getNestedContent(descEl, ["dcc:content"]).trim() : "";
                // This app writes one method named "Procedure" with the text as its description.
                if (desc && name && name !== "Procedure") return `${name}: ${desc}`;
                return desc || name;
            }).filter(Boolean);
            const prop: MaterialProperty = {
                uuid: uuid(),
                id: "",
                name: getNestedContent(p, ["drmd:name", "dcc:content"]),
                description: childElements(p, "drmd:description")[0] ? getNestedContent(childElements(p, "drmd:description")[0], ["dcc:content"]) : "",
                procedures: methods.join("\n\n"),
                isCertified: p.getAttribute("isCertified") === "true",
                materialRef: blockRef.materialUuid || undefined,
                results: []
            };

            const results = p.getElementsByTagName("drmd:result");
            prop.results = Array.from(results).map(r => {
                // refId on the result (material and/or lot); otherwise the block's material applies
                const resultRef = resolveRefs(r.getAttribute("refId"));
                const resultDesc = childElements(r, "drmd:description")[0];

                const res: MeasurementResult = {
                    uuid: uuid(),
                    name: getNestedContent(r, ["drmd:name", "dcc:content"]),
                    description: resultDesc ? getNestedContent(resultDesc, ["dcc:content"]) : "",
                    materialRef: resultRef.materialUuid || blockRef.materialUuid,
                    linkedBatchLot: resultRef.lot,
                    quantities: []
                };

                const quants = r.getElementsByTagName("drmd:quantity");
                res.quantities = Array.from(quants).map(q => {
                    const quant: Quantity = { ...INITIAL_QUANTITY, uuid: uuid(), identifiers: [] };
                    quant.name = getNestedContent(q, ["dcc:name", "dcc:content"]);
                    
                    const real = q.getElementsByTagName("si:real")[0];
                    if (real) {
                        quant.value = getNestedContent(real, ["si:value"]);
                        quant.unit = getNestedContent(real, ["si:unit"]);
                        // A unit that is not D-SI (written as typed) is not shown as the D-SI unit
                        quant.dsiUnit = quant.unit.trim().startsWith('\\') ? quant.unit.trim() : '';
                        quant.dsiValue = quant.value;
                        
                        const expandedMU = real.getElementsByTagName("si:expandedMU")[0];
                        if (expandedMU) {
                             quant.uncertainty = getNestedContent(expandedMU, ["si:valueExpandedMU"]);
                             quant.coverageFactor = getNestedContent(expandedMU, ["si:coverageFactor"]);
                             quant.coverageProbability = getNestedContent(expandedMU, ["si:coverageProbability"]);
                             quant.distribution = getNestedContent(expandedMU, ["si:distribution"]);
                        }
                        // A standard uncertainty has no k and no coverage probability.
                        const standardMU = real.getElementsByTagName("si:standardMU")[0];
                        if (!expandedMU && standardMU) {
                             quant.uncertainty = getNestedContent(standardMU, ["si:valueStandardMU"]);
                             quant.distribution = getNestedContent(standardMU, ["si:distribution"]);
                        }
                    } else {
                        // Limits / ranges / text, number lists and code lists
                        const noQ = q.getElementsByTagName("dcc:noQuantity")[0];
                        const realList = q.getElementsByTagName("si:realListXMLList")[0];
                        const chars = q.getElementsByTagName("dcc:charsXMLList")[0];
                        if (noQ) {
                            quant.value = getNestedContent(noQ, ["dcc:content"]);
                            quant.unit = "";
                        } else if (realList) {
                            quant.value = getNestedContent(realList, ["si:valueXMLList"]).trim();
                            quant.unit = (getNestedContent(realList, ["si:unitXMLList"]).trim().split(/\s+/)[0]) || "";
                            quant.dsiUnit = quant.unit.startsWith('\\') ? quant.unit : '';
                        } else if (chars) {
                            quant.value = (chars.textContent || "").trim();
                            quant.unit = "";
                        }
                    }

                    const propIdsNode = q.getElementsByTagName("drmd:propertyIdentifiers")[0];
                    if (propIdsNode) {
                        const propIds = propIdsNode.getElementsByTagName("drmd:propertyIdentifier");
                        if (propIds.length > 0) {
                            quant.identifiers = Array.from(propIds).map(pi => ({
                                scheme: getNestedContent(pi, ["drmd:scheme"]),
                                value: getNestedContent(pi, ["drmd:value"]),
                                link: safeHttpUrl(getNestedContent(pi, ["drmd:link"]))
                            }));
                        }
                    }

                    return quant;
                });
                return res;
            });

            return prop;
        });
    }

    // --- Statements ---
    const statements = doc.getElementsByTagName("drmd:statements")[0];
    if (statements) {
        const getSt = (tag: string) => {
             const el = statements.getElementsByTagName("drmd:" + tag)[0];
             if (!el) return "";
             
             // Iterate direct children to find dcc:content and avoid matching nested dcc:content in dcc:name
             for (let i = 0; i < el.childNodes.length; i++) {
                 const node = el.childNodes[i] as Element;
                 if (node.nodeType === 1 && node.tagName === "dcc:content") {
                     return node.textContent || "";
                 }
             }
             return "";
        };

        data.statements.official.intendedUse = getSt("intendedUse");
        data.statements.official.storageInformation = getSt("storageInformation");
        data.statements.official.handlingInstructions = getSt("instructionsForHandlingAndUse");
        data.statements.official.metrologicalTraceability = getSt("metrologicalTraceability");
        data.statements.official.subcontractors = getSt("subcontractors");
        data.statements.official.referenceToCertificationReport = getSt("referenceToCertificationReport");
        data.statements.official.healthAndSafety = getSt("healthAndSafetyInformation");
        data.statements.official.legalNotice = getSt("legalNotice");
        data.statements.official.commutability = getSt("commutability");

        // Custom statements (drmd:statement, repeatable)
        data.statements.custom = childElements(statements, "drmd:statement").map(el => {
            const nameEl = childElements(el, "dcc:name")[0];
            const contentEl = childElements(el, "dcc:content")[0];
            return {
                uuid: uuid(),
                name: nameEl ? getNestedContent(nameEl, ["dcc:content"]) : "",
                content: contentEl?.textContent || ""
            };
        });
    }

    // --- Comments & Document ---
    data.generalComment = getTagContent(doc, "drmd:comment");
    
    const docElements = doc.getElementsByTagName("drmd:document");
    if (docElements.length > 0) {
        // dcc:name / dcc:description of an embedded file: the text of their own dcc:content children.
        const textOf = (el: Element, tag: string) => {
            const holder = childElements(el, tag)[0];
            if (!holder) return "";
            return childElements(holder, "dcc:content").map(c => (c.textContent || "").trim()).filter(Boolean)[0] || "";
        };
        const docs: BinaryDocument[] = Array.from(docElements).map((el, index) => {
            const b64El = el.getElementsByTagName("dcc:dataBase64")[0];
            if (b64El) {
                const name = textOf(el, "dcc:name");
                const description = textOf(el, "dcc:description");
                const fileName = getTagContent(el, "dcc:fileName") || `imported_document_${index + 1}.pdf`;
                const mimeType = getTagContent(el, "dcc:mimeType") || "application/pdf";
                return {
                    fileName,
                    mimeType,
                    data: (b64El.textContent || "").replace(/\s+/g, ""),
                    ...(isRmDocumentName(name) && isPdfDocument({ mimeType, fileName }) ? { rmDocument: true } : {
                        ...(name ? { name } : {}),
                        ...(description ? { description } : {}),
                    }),
                };
            }
            // Files from earlier versions: raw base64 directly inside drmd:document
            const content = el.textContent || "";
            return {
                fileName: `imported_document_${index + 1}.pdf`,
                mimeType: "application/pdf", 
                data: content.trim()
            };
        }).filter(d => d.data.length > 0);
        // One human-readable PDF at most. A file without that name (written by other software or by an
        // earlier version) has its first PDF taken as the human-readable one, as the viewer always did.
        const first = docs.findIndex(d => d.rmDocument);
        if (first >= 0) docs.forEach((d, i) => { if (i !== first) delete d.rmDocument; });
        else {
            const pdf = docs.findIndex(d => isPdfDocument(d));
            if (pdf >= 0) docs[pdf] = { ...docs[pdf], rmDocument: true };
        }
        data.binaryDocuments = docs;
    }

    return data;
};
