// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

export interface Identifier {
    scheme: string;
    value: string;
    link?: string;
}

export interface Address {
    street: string;
    streetNo: string;
    postCode: string;
    city: string;
    countryCode: string;
}

export interface HasCoordinates {
    fieldCoordinates?: Record<string, number[]>; // [pageIndex, ymin, xmin, ymax, xmax] (0-1000 scale)
    sectionCoordinates?: number[]; // [pageIndex, ymin, xmin, ymax, xmax] (0-1000 scale)
    originalTexts?: Record<string, string>; // Maps field name to original verbatim PDF text (only for transformed/normalized values)
}

export interface Producer extends HasCoordinates {
    uuid: string;
    name: string;
    email: string;
    phone: string;
    fax?: string;
    address: Address;
    organizationIdentifiers: Identifier[];
}

export interface ResponsiblePerson extends HasCoordinates {
    uuid: string;
    name: string;
    role: string;
    description: string;
    mainSigner: boolean;
    cryptElectronicSeal: boolean;
    cryptElectronicSignature: boolean;
    cryptElectronicTimeStamp: boolean;
}

export interface AdministrativeData extends HasCoordinates {
    title: string;
    uniqueIdentifier: string;
    documentVersion: string;
    dataVersion: number;
    documentIdentifiers: Identifier[];
    validityType: "Until Revoked" | "Time After Dispatch" | "Specific Time";
    durationY: number;
    durationM: number;
    dateOfIssue: string; // YYYY-MM-DD
    specificTime: string; // YYYY-MM-DD
    producers: Producer[];
    responsiblePersons: ResponsiblePerson[];
}

export interface Material extends HasCoordinates {
    uuid: string;
    xmlId: string;
    name: string;
    rmCode: string;
    materialClass: string;
    description: string;
    itemQuantities: string;
    minimumSampleSize: string;
    isCertified: boolean;
    materialIdentifiers: Identifier[];
    /** Set when the user changes the CAS / InChIKey identifiers; the background look-up then leaves them alone. */
    identifiersEdited?: boolean;
}

export interface Quantity extends HasCoordinates {
    uuid: string;
    name: string; // Element/Name
    label?: string;
    value: string;
    dsiValue: string; // Changed from siValue
    dsiUnit: string;  // Changed from siUnit
    /**
     * Where the D-SI unit comes from: the rules of the D-SI guide ("rules"), the AI with the unit's
     * context, checked by the rules ("ai"), or typed in the form ("manual"). A manual one is kept.
     */
    dsiSource?: 'rules' | 'ai' | 'manual';
    /** Why the D-SI unit was written as it is (from the AI answer), shown in the notice. */
    dsiNote?: string;
    quantityKind?: string;
    unit: string;
    uncertainty: string;
    coverageFactor: string;
    coverageProbability: string;
    distribution: string;
    identifiers: Identifier[];
    /** Set when the user changes the identifiers; the background look-up then leaves them alone. */
    identifiersEdited?: boolean;
}

export interface MeasurementResult extends HasCoordinates {
    uuid: string;
    name: string; // Table Name
    description: string;
    coverageReasoning?: string; // AI's reasoning for why kFactor/probability were assigned
    quantities: Quantity[];
    materialRef?: string; // Links this specific result table to a Material UUID
    linkedBatchLot?: string; // Links this result table to a specific batch/lot
}

export interface MaterialProperty {
    uuid: string;
    id: string;
    name: string; // e.g., "Certified Values"
    description: string;
    isCertified: boolean;
    procedures: string;
    materialRef?: string; // UUID of linked material — generates refId on <drmd:properties>
    results: MeasurementResult[];
}

export interface OfficialStatements extends HasCoordinates {
    intendedUse: string;
    commutability: string;
    storageInformation: string;
    handlingInstructions: string;
    metrologicalTraceability: string;
    healthAndSafety: string;
    subcontractors: string;
    legalNotice: string;
    referenceToCertificationReport: string;
}

export interface CustomStatement {
    uuid: string;
    name: string;
    content: string;
}

export interface Statements {
    official: OfficialStatements;
    custom: CustomStatement[];
}

export interface Comment {
    uuid: string;
    author: string;
    date: string;
    content: string;
}

export interface AdditionalDocument {
    uuid: string;
    title: string;
    type: string;
    content: string;
}

export interface DRMD {
    administrativeData: AdministrativeData;
    materials: Material[];
    properties: MaterialProperty[];
    statements: Statements;
    comments: Comment[];
    documents: AdditionalDocument[];
    // New fields for the "Comment and Document" tab
    generalComment: string;
    binaryDocuments: BinaryDocument[];
}

/** A file embedded in the XML as drmd:document (dcc:byteDataType). */
export interface BinaryDocument {
    fileName: string;
    mimeType: string;
    data: string; // Base64 data
    /**
     * The human-readable PDF of the RM document (certificate or product information sheet). It is
     * shown in the certificate pane, written first and named as such in the XML (guidance document,
     * section 7.3.1: name every embedded document so the official rendition can be told apart).
     */
    rmDocument?: boolean;
    /** dcc:name and dcc:description of another embedded document, kept as read from an imported XML. */
    name?: string;
    description?: string;
}

/** dcc:name of the embedded human-readable PDF, by document type. */
export const RM_DOCUMENT_NAME = {
    referenceMaterialCertificate: 'Human-readable PDF certificate',
    productInformationSheet: 'Human-readable PDF product information sheet',
} as const;
export const rmDocumentName = (title?: string) =>
    title === 'productInformationSheet' ? RM_DOCUMENT_NAME.productInformationSheet : RM_DOCUMENT_NAME.referenceMaterialCertificate;
/** True for a PDF file (by its type or its name): only a PDF can be the human-readable rendition shown in the viewer. */
export const isPdfDocument = (d: { mimeType?: string; fileName?: string }) => /pdf/i.test(d.mimeType || '') || /\.pdf$/i.test(d.fileName || '');
/** True for a dcc:name the generator writes for the human-readable PDF (either document type). */
export const isRmDocumentName = (name?: string) => /^\s*human-readable pdf\b/i.test(name || '');

export interface BulkResult {
    id: string;
    fileName: string;
    rmCode: string;
    rmName: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    errorMessage?: string;
    /** Result of validateDrmd on the generated document (schema constraints + business rules). */
    validation?: { errors: number; conditionalErrors: number; warnings: number };
    /** Parts the AI's answer was still missing after all attempts (empty/undefined = complete). */
    incomplete?: string[];
    xmlContent: string;
    htmlContent: string;
    /**
     * The extracted document. To keep memory flat over long runs, the embedded source PDF is not
     * held here (its base64 data is emptied); it is read back from the PDF file when needed.
     */
    drmdData: DRMD;
    /** Path of the PDF inside the chosen folder (shows subfolders). */
    filePath?: string;
    /** Name of the XML written next to the PDF (folder runs). */
    savedAs?: string;
    /** Why writing the result into the folder failed, if it did. */
    saveError?: string;
    /** An XML already sat next to this PDF, so it was not extracted again in this run. */
    savedEarlier?: boolean;
    /** For savedEarlier rows: the XML has been read in (on first Review). */
    loaded?: boolean;
}

// Constants for Initial States
export const ALLOWED_TITLES = [
    "referenceMaterialCertificate",
    "productInformationSheet"
];

export const INITIAL_ID: Identifier = { scheme: "", value: "", link: "" };

export const INITIAL_PRODUCER: Producer = {
    uuid: "",
    name: "",
    email: "",
    phone: "",
    fax: "",
    address: { street: "", streetNo: "", postCode: "", city: "", countryCode: "" },
    organizationIdentifiers: [{ ...INITIAL_ID }]
};

export const INITIAL_PERSON: ResponsiblePerson = {
    uuid: "",
    name: "",
    role: "",
    description: "",
    mainSigner: false, // Default to false so only the first one (initialized manually) is true
    cryptElectronicSeal: false,
    cryptElectronicSignature: false,
    cryptElectronicTimeStamp: false
};

export const INITIAL_QUANTITY: Quantity = {
    uuid: "",
    name: "",
    label: "",
    value: "",
    dsiValue: "",
    dsiUnit: "",
    quantityKind: "",
    unit: "",
    uncertainty: "",
    coverageFactor: "",
    coverageProbability: "",
    distribution: "",
    identifiers: []
};

export const INITIAL_DRMD: DRMD = {
    administrativeData: {
        title: "referenceMaterialCertificate",
        uniqueIdentifier: "",
        documentVersion: "1.0",
        dataVersion: 0,
        documentIdentifiers: [{ ...INITIAL_ID }],
        validityType: "Until Revoked",
        durationY: 0,
        durationM: 0,
        dateOfIssue: "",
        specificTime: "",
        producers: [{ ...INITIAL_PRODUCER, address: { ...INITIAL_PRODUCER.address }, organizationIdentifiers: INITIAL_PRODUCER.organizationIdentifiers.map(id => ({ ...id })) }],
        responsiblePersons: [{ ...INITIAL_PERSON, mainSigner: true }] // First person defaults to Main Signer
    },
    materials: [],
    properties: [],
    statements: {
        official: {
            intendedUse: "",
            commutability: "",
            storageInformation: "",
            handlingInstructions: "",
            metrologicalTraceability: "",
            healthAndSafety: "",
            subcontractors: "",
            legalNotice: "",
            referenceToCertificationReport: ""
        },
        custom: []
    },
    comments: [],
    documents: [],
    generalComment: "",
    binaryDocuments: []
};