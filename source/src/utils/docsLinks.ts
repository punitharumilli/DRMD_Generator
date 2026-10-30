// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Links from the generator's own field names to the DRMD guidance document.
 *
 * Every label in the editor is a DRMD schema name, not extracted content, so clicking one
 * should explain what that name means. The paths below are the guide's real heading anchors
 * (taken from its MkDocs search index), so each link lands on the exact subsection rather
 * than the top of a chapter.
 */

export const DOCS_BASE = "https://punitharumilli.github.io/BestPracticeDocs/";

/** The video guide for this generator on the DRMD video site. */
export const VIDEO_GUIDE_URL = "https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator";

/**
 * Normalized label → path within the guide.
 *
 * Keys are normalized by `normalizeDocsKey`: lower-cased, with parenthetical hints,
 * required-field asterisks and trailing punctuation removed. Deliberately NO entries for
 * ambiguous names ("name", "description", "value", "content") — those mean different things
 * in different sections, so their call sites pass an explicit `docs` path instead.
 */
const LABEL_LINKS: Record<string, string> = {
    // 3. Administrative Data
    "title of document": "administrative_data/#311-title-of-the-document-titleofthedocument",
    "unique identifier": "administrative_data/#312-unique-identifier-uniqueidentifier",
    "document version": "administrative_data/#313-document-version-documentversion",
    "document identifiers": "administrative_data/#314-document-identifiers-documentidentifiers",
    "period of validity": "administrative_data/#315-validity-validity",
    "validity type": "administrative_data/#315-validity-validity",
    "valid until date": "administrative_data/#315-validity-validity",
    "dispatch date": "administrative_data/#315-validity-validity",
    "years": "administrative_data/#315-validity-validity",
    "months": "administrative_data/#315-validity-validity",
    "iso 8601 format": "administrative_data/#315-validity-validity",
    "email": "administrative_data/#322-contact",
    "phone": "administrative_data/#322-contact",
    "fax": "administrative_data/#322-contact",
    "street": "administrative_data/#322-contact",
    "no": "administrative_data/#322-contact",
    "post code": "administrative_data/#322-contact",
    "city": "administrative_data/#322-contact",
    "country": "administrative_data/#322-contact",
    "role": "administrative_data/#331-responsible-person-entry-respperson",
    "main signer": "administrative_data/#331-responsible-person-entry-respperson",

    // 4. Materials
    "material class": "materials/#44-material-classification-materialclass",
    "min sample size": "materials/#451-minimum-sample-size-minimumsamplesize",
    "minimum sample size": "materials/#451-minimum-sample-size-minimumsamplesize",
    "item quantities": "materials/#452-item-quantities-itemquantities",
    "rm code": "materials/#47-material-identifiers",
    "material identifier": "materials/#472-material-identifier-entry",
    "assigned material identifier": "materials/#473-attributes",

    // 5. Properties
    "certified": "properties/#532-technical-attributes",
    "procedures": "properties/#5101-procedures-procedures",
    "table name": "properties/#55-result-type-result",
    "table description": "properties/#55-result-type-result",
    "identifiers": "properties/#59-property-identifiers-propertyidentifiers",

    // 6. Statements
    "intended use": "statements/#631-intended-use-intendeduse",
    "commutability": "statements/#632-commutability-commutability",
    "storage information": "statements/#633-storage-information-storageinformation",
    "instructions for handling and use": "statements/#634-instructions-for-handling-and-use-instructionsforhandlinganduse",
    "metrological traceability": "statements/#635-metrological-traceability-metrologicaltraceability",
    "health and safety information": "statements/#636-health-and-safety-information-healthandsafetyinformation",
    "subcontractors": "statements/#637-subcontractors-subcontractors",
    "legal notice": "statements/#638-legal-notice-legalnotice",
    "reference to certification report": "statements/#639-reference-to-certification-report-referencetocertificationreport",
    "statement name": "statements/#6310-statement-catch-all-statement",

    // 7. Comments and Documents
    "comment": "comments_documents/#72-comment-comment",
    "upload documents": "comments_documents/#73-document-document",

    // 10. Cross-references — the "linked ..." fields all become refId attributes
    "linked material": "cross_references/#102-linking-multi-material-documents",
    "linked material identifier": "cross_references/#102-linking-multi-material-documents",
    "linked batch/lot": "cross_references/#102-linking-multi-material-documents",

    // 11. Units, Quantities & Uncertainty
    "dsi unit": "units_quantities/#111-unit-strings-siunit",
    "uncertainty": "units_quantities/#116-uncertainty",
    "k": "units_quantities/#1162-say-what-the-uncertainty-means-once",
    "k factor": "units_quantities/#1162-say-what-the-uncertainty-means-once",
    "prob": "units_quantities/#1162-say-what-the-uncertainty-means-once",
    "probability": "units_quantities/#1162-say-what-the-uncertainty-means-once",
};

/** Chapter- and subsection-level paths used by headings and by disambiguated fields. */
export const DOCS_PATHS = {
    home: "",
    architecture: "architecture/",
    coreData: "administrative_data/#31-core-data-coredata",
    producer: "administrative_data/#32-reference-material-producer-referencematerialproducer",
    producerName: "administrative_data/#321-name",
    responsiblePersons: "administrative_data/#33-responsible-persons-resppersons",
    responsiblePerson: "administrative_data/#331-responsible-person-entry-respperson",
    personDetails: "administrative_data/#332-person-details-dccperson",
    materials: "materials/",
    materialName: "materials/#431-name-name",
    materialDescription: "materials/#432-description-description",
    materialIdentifiers: "materials/#47-material-identifiers",
    properties: "properties/",
    propertiesBlock: "properties/#531-child-elements",
    result: "properties/#55-result-type-result",
    quantity: "properties/#58-quantity-type-quantity",
    propertyIdentifiers: "properties/#59-property-identifiers-propertyidentifiers",
    statements: "statements/",
    standardStatements: "statements/#63-standard-statements",
    customStatement: "statements/#6310-statement-catch-all-statement",
    commentsDocuments: "comments_documents/",
    comment: "comments_documents/#72-comment-comment",
    document: "comments_documents/#73-document-document",
    crossReferences: "cross_references/#102-linking-multi-material-documents",
    unitStrings: "units_quantities/#111-unit-strings-siunit",
    values: "units_quantities/#1112-values-and-the-nan-question",
    uncertainty: "units_quantities/#116-uncertainty",
    coverage: "units_quantities/#1162-say-what-the-uncertainty-means-once",
    validationRules: "validation_rules/",
    digitalSignature: "digital_signature/",
} as const;

/** Lower-case a label and drop the decoration the UI adds around the schema name. */
export function normalizeDocsKey(label: string): string {
    return label
        .replace(/\([^)]*\)/g, " ")   // "(e.g. Batch, Lot)", "(XML ID)", "(refId)"
        .replace(/[*]/g, " ")          // required-field marker
        .replace(/[.:]+\s*$/, "")     // "Prob.", "No."
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/**
 * Resolve a field label (or an explicit guide path) to a full URL.
 * Returns undefined when the name has no documented counterpart, so the caller can render
 * it as plain text rather than a dead link.
 */
export function docsUrlFor(label?: string, override?: string): string | undefined {
    if (override) return /^https?:\/\//.test(override) ? override : DOCS_BASE + override;
    if (!label) return undefined;
    const path = LABEL_LINKS[normalizeDocsKey(label)];
    return path ? DOCS_BASE + path : undefined;
}
