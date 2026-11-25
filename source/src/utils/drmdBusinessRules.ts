// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * DRMD business rules (Schematron), embedded so the app can run the OFFICIAL rules on the exact XML
 * it exports. Copied verbatim from drmd-business-rules.sch, schemaVersion 1.0.0
 * (31 assertions in 4 patterns): ids, roles, rule contexts and XPath tests are
 * unchanged; only whitespace inside the messages was collapsed.
 *
 * Every test in that file is valid XPath 1.0 (the .sch says so explicitly), which is what lets the
 * browser's built-in XPath engine evaluate them. If drmd-business-rules.sch is updated, update this
 * file from it — do not edit the rules here independently.
 */

export type SchematronRole = 'error' | 'conditional-error' | 'warning';

export interface SchematronCheck {
    kind: 'assert' | 'report';
    id: string;
    role: SchematronRole;
    test: string;
    message: string;
}

export interface SchematronRule {
    context: string;
    checks: SchematronCheck[];
}

export interface SchematronPattern {
    id: string;
    rules: SchematronRule[];
}

export const DRMD_SCHEMA_VERSION = "1.0.0";

export const SCHEMATRON_NAMESPACES: Record<string, string> = {
    "drmd": "urn:drmd:schema",
    "dcc": "https://ptb.de/dcc",
    "si": "https://ptb.de/si"
};

export const SCHEMATRON_PATTERNS: SchematronPattern[] = [
    {
        "id": "shared-structural-rules",
        "rules": [
            {
                "context": "drmd:digitalReferenceMaterialDocument",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "DRMD-001",
                        "role": "error",
                        "test": "drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument",
                        "message": "[DRMD-001] Every DRMD document MUST declare a titleOfTheDocument in coreData, specifying either 'referenceMaterialCertificate' or 'productInformationSheet'."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-002",
                        "role": "error",
                        "test": "drmd:materials/drmd:material",
                        "message": "[DRMD-002] Every DRMD document MUST contain at least one material entry in the materials catalogue (ISO 33401:2024, 5.2.4, Name of the RM)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-003",
                        "role": "error",
                        "test": "drmd:propertiesList/drmd:properties",
                        "message": "[DRMD-003] Every DRMD document MUST contain at least one properties block with measurement data (ISO 33401:2024, 5.2.15, Property of interest)."
                    }
                ]
            },
            {
                "context": "drmd:digitalReferenceMaterialDocument/drmd:statements",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "DRMD-004",
                        "role": "error",
                        "test": "drmd:intendedUse[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula]",
                        "message": "[DRMD-004] Every DRMD document MUST include an intendedUse statement giving the main intended use of the material (ISO 33401:2024, 5.2.6, Intended use)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-005",
                        "role": "error",
                        "test": "drmd:storageInformation[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula]",
                        "message": "[DRMD-005] Every DRMD document MUST include storageInformation specifying environmental storage conditions (ISO 33401:2024, 5.2.10, Storage information)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-006",
                        "role": "error",
                        "test": "drmd:instructionsForHandlingAndUse[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula]",
                        "message": "[DRMD-006] Every DRMD document MUST include instructionsForHandlingAndUse (ISO 33401:2024, 5.2.11, Instructions for handling and use)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-013",
                        "role": "conditional-error",
                        "test": "drmd:commutability[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula]",
                        "message": "[DRMD-013] Every DRMD document MUST include a commutability statement whenever applicable. Commutability is particularly important for reference materials intended for use with multiple measurement procedures (ISO 33401:2024, 5.2.9, Commutability: 'Mandatory whenever applicable' for both document types)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-015",
                        "role": "warning",
                        "test": "drmd:healthAndSafetyInformation[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula]",
                        "message": "[DRMD-015] DRMD documents SHOULD include healthAndSafetyInformation: a statement on the safety data sheet and, for hazardous materials, the appropriate warnings (ISO 33401:2024, 5.4.3, Health and safety information: 'Recommended' for both document types)."
                    }
                ]
            },
            {
                "context": "drmd:materials/drmd:material",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "DRMD-007",
                        "role": "error",
                        "test": "drmd:name[dcc:content[normalize-space(.) != '']]",
                        "message": "[DRMD-007] Every material entry MUST include a name element (ISO 33401:2024, 5.2.4, Name of the RM)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-008",
                        "role": "conditional-error",
                        "test": "drmd:minimumSampleSize",
                        "message": "[DRMD-008] Each material entry MUST specify a minimumSampleSize whenever applicable: the smallest amount of material for which the stated property values and uncertainties apply (ISO 33401:2024, 5.2.7, Minimum sample size: 'Mandatory whenever applicable' for both document types)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-016",
                        "role": "error",
                        "test": "drmd:materialIdentifiers/drmd:materialIdentifier",
                        "message": "[DRMD-016] Each material entry MUST carry at least one materialIdentifier giving the unique identifier of the reference material (ISO 33401:2024, 5.2.3, Unique identifier of the RM: 'Mandatory' for both document types). The identifier must distinguish this RM from any other RM issued by the same producer; a product code, normally combined with a batch or lot number, satisfies this. Note that coreData/uniqueIdentifier identifies the DOCUMENT and does not satisfy 5.2.3, because one document may cover several materials and one material may be described by successive document revisions."
                    }
                ]
            },
            {
                "context": "drmd:propertiesList/drmd:properties",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "DRMD-009",
                        "role": "error",
                        "test": "drmd:results/drmd:result",
                        "message": "[DRMD-009] Every properties block MUST contain at least one result entry with measurement data (ISO 33401:2024, 5.2.15, Property of interest)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-014",
                        "role": "conditional-error",
                        "test": "drmd:procedures[dcc:usedMethod/dcc:name/dcc:content[normalize-space(.) != '']]",
                        "message": "[DRMD-014] Each properties block MUST include measurement procedures whenever applicable. This combines two ISO requirements: procedures for operationally defined measurands (ISO 33401:2024, 5.2.14, 'Mandatory whenever applicable' for both document types) and procedures for non-operationally defined measurands (ISO 33401:2024, 5.4.2, 'Recommended' for both document types). Taken together, the overall requirement is 'Mandatory whenever applicable'."
                    }
                ]
            },
            {
                "context": "drmd:administrativeData",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "DRMD-010",
                        "role": "error",
                        "test": "drmd:referenceMaterialProducer",
                        "message": "[DRMD-010] Every DRMD document MUST identify the referenceMaterialProducer (ISO 33401:2024, 5.2.5, Name and contact details of the RM producer)."
                    }
                ]
            },
            {
                "context": "drmd:administrativeData/drmd:coreData",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "DRMD-012",
                        "role": "error",
                        "test": "drmd:validity",
                        "message": "[DRMD-012] Every DRMD document MUST specify a validity period or condition (ISO 33401:2024, 5.2.8, Period of validity)."
                    },
                    {
                        "kind": "assert",
                        "id": "DRMD-011",
                        "role": "error",
                        "test": "drmd:documentVersion",
                        "message": "[DRMD-011] Every DRMD document MUST state its documentVersion in coreData (ISO 33401:2024, 5.2.13, Document version: 'Mandatory' for both document types). A version number, an approval date, or both are acceptable, provided the value changes whenever the document content changes. This requirement is also enforced structurally by drmd.xsd; the rule is stated here so that a Schematron report covers ISO 33401:2024, Table 1 in full on its own."
                    }
                ]
            }
        ]
    },
    {
        "id": "rmc-document-rules",
        "rules": [
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'referenceMaterialCertificate']",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "RMC-001",
                        "role": "error",
                        "test": "drmd:statements/drmd:metrologicalTraceability[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula]",
                        "message": "[RMC-001] Reference Material Certificates MUST include a metrologicalTraceability statement that gives, for the certified values, the reference to which they are metrologically traceable (ISO 33401:2024, 5.3.4, Metrological traceability: 'Mandatory' for RM certificate). This is not required for productInformationSheet documents."
                    },
                    {
                        "kind": "assert",
                        "id": "RMC-002",
                        "role": "error",
                        "test": "drmd:propertiesList/drmd:properties[(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')]",
                        "message": "[RMC-002] Reference Material Certificates MUST have at least one properties block with the attribute isCertified=\"true\" (or its equivalent \"1\") containing certified property values (ISO 33401:2024, 5.3.3, Property value and associated uncertainty: 'Mandatory' for RM certificate). A certificate without certified values does not meet ISO 33401:2024."
                    },
                    {
                        "kind": "assert",
                        "id": "RMC-003",
                        "role": "error",
                        "test": "drmd:propertiesList/drmd:properties/drmd:results/drmd:result",
                        "message": "[RMC-003] Reference Material Certificates MUST include property values (ISO 33401:2024, 5.3.3, Property value and associated uncertainty)."
                    },
                    {
                        "kind": "assert",
                        "id": "RMC-005",
                        "role": "warning",
                        "test": "drmd:propertiesList/drmd:properties[(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')]/drmd:procedures[dcc:usedMethod/dcc:name/dcc:content[normalize-space(.) != '']]",
                        "message": "[RMC-005] Reference Material Certificates SHOULD document the measurement procedures used for certified properties (ISO 33401:2024, 5.4.2, Measurement procedures for non-operationally defined measurands: 'Recommended' for both document types)."
                    },
                    {
                        "kind": "assert",
                        "id": "RMC-010",
                        "role": "error",
                        "test": "drmd:administrativeData/drmd:respPersons",
                        "message": "[RMC-010] Reference Material Certificates MUST list responsible persons including the name and function of the RM producer's approving officer (ISO 33401:2024, 5.3.5, Name and function of the RM producer's approving officer: 'Mandatory' for RM certificate, 'Optional' for product information sheet)."
                    },
                    {
                        "kind": "assert",
                        "id": "RMC-012",
                        "role": "error",
                        "test": "drmd:administrativeData/drmd:respPersons/dcc:respPerson[normalize-space(dcc:role) != '']",
                        "message": "[RMC-012] In a Reference Material Certificate, at least one dcc:respPerson MUST state a dcc:role. ISO 33401:2024, 5.3.5 requires both the name and the function of the RM producer's approving officer; RMC-010 checks that the respPersons list exists, and this rule checks that the function is recorded. The name is required by dcc:respPerson itself and needs no separate rule; by the note to 5.3.5 it may be the name of the responsible organisation."
                    },
                    {
                        "kind": "assert",
                        "id": "RMC-011",
                        "role": "error",
                        "test": "not(drmd:materials/drmd:material[not(drmd:description[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula])])",
                        "message": "[RMC-011] Reference Material Certificates MUST include a description for each material (ISO 33401:2024, 5.3.2, Description of the material: 'Mandatory' for RM certificate, 'Recommended' for product information sheet)."
                    }
                ]
            }
        ]
    },
    {
        "id": "rmc-certified-property-rules",
        "rules": [
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'referenceMaterialCertificate'] //drmd:properties[(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')] //drmd:result/drmd:data/drmd:quantity[si:real or si:complex or si:constant]",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "RMC-006",
                        "role": "error",
                        "test": "si:real[si:measurementUncertaintyUnivariate or si:expandedUnc or si:coverageInterval] or si:complex[si:ellipsoidalRegion or si:rectangularRegion] or si:constant[si:valueStandardMU or si:uncertainty]",
                        "message": "[RMC-006] A certified property value given as a single si:real, si:complex or si:constant quantity MUST include its measurement uncertainty, in one of the forms that D-SI provides for it (si:real: si:measurementUncertaintyUnivariate, or the older si:expandedUnc or si:coverageInterval; si:complex: si:ellipsoidalRegion or si:rectangularRegion; si:constant: si:valueStandardMU or si:uncertainty). This is required for all certified values in Reference Material Certificates (ISO 33401:2024, 5.3.3, Property value and associated uncertainty: 'Mandatory' for RM certificate)."
                    }
                ]
            },
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'referenceMaterialCertificate'] //drmd:properties[(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')] //drmd:result/drmd:data/drmd:list/drmd:quantity[si:real or si:complex or si:constant]",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "RMC-007",
                        "role": "error",
                        "test": "si:real[si:measurementUncertaintyUnivariate or si:expandedUnc or si:coverageInterval] or si:complex[si:ellipsoidalRegion or si:rectangularRegion] or si:constant[si:valueStandardMU or si:uncertainty]",
                        "message": "[RMC-007] Certified property values in list quantities expressed as si:real, si:complex or si:constant MUST include measurement uncertainty, in one of the forms that D-SI provides for them (see RMC-006). Each quantity in a certified data list must carry uncertainty information (ISO 33401:2024, 5.3.3, Property value and associated uncertainty: 'Mandatory' for RM certificate)."
                    }
                ]
            },
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'referenceMaterialCertificate'] //drmd:properties[(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')] //drmd:result/drmd:data//drmd:quantity[si:realListXMLList or si:complexListXMLList]",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "RMC-008",
                        "role": "error",
                        "test": "si:realListXMLList[si:measurementUncertaintyUnivariateXMLList or si:expandedUncXMLList or si:coverageIntervalXMLList or si:measurementUncertaintyMultivariateXMLList/* or si:ellipsoidalRegionXMLList or si:rectangularRegionXMLList] or si:complexListXMLList[si:measurementUncertaintyBivariateXMLList/* or si:measurementUncertaintyMultivariateXMLList/*]",
                        "message": "[RMC-008] Certified property values expressed as si:realListXMLList or si:complexListXMLList, as a single quantity or inside a list, MUST include measurement uncertainty: for si:realListXMLList one of si:measurementUncertaintyUnivariateXMLList, si:measurementUncertaintyMultivariateXMLList, si:ellipsoidalRegionXMLList, si:rectangularRegionXMLList, or the older si:expandedUncXMLList or si:coverageIntervalXMLList; for si:complexListXMLList a non-empty si:measurementUncertaintyBivariateXMLList or si:measurementUncertaintyMultivariateXMLList. This is required for all certified values in Reference Material Certificates (ISO 33401:2024, 5.3.3)."
                    }
                ]
            },
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'referenceMaterialCertificate'] //drmd:properties[(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')] //drmd:result/drmd:data//drmd:quantity[si:hybrid]",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "RMC-009",
                        "role": "error",
                        "test": "not(si:hybrid/si:real[not(si:measurementUncertaintyUnivariate or si:expandedUnc or si:coverageInterval)]) and not(si:hybrid/si:complex[not(si:ellipsoidalRegion or si:rectangularRegion)]) and not(si:hybrid/si:constant[not(si:valueStandardMU or si:uncertainty)]) and not(si:hybrid//si:realListXMLList[not(si:measurementUncertaintyUnivariateXMLList or si:expandedUncXMLList or si:coverageIntervalXMLList or si:measurementUncertaintyMultivariateXMLList/* or si:ellipsoidalRegionXMLList or si:rectangularRegionXMLList)]) and not(si:hybrid//si:complexListXMLList[not(si:measurementUncertaintyBivariateXMLList/* or si:measurementUncertaintyMultivariateXMLList/*)]) and not(si:hybrid//si:realList[not(si:listMeasurementUncertaintyUnivariate or si:listUnivariateUnc or si:ellipsoidalRegion or si:rectangularRegion or not(si:real[not(si:measurementUncertaintyUnivaraite or si:expandedUnc or si:coverageInterval)]))]) and not(si:hybrid//si:complexList[not(si:listBivariateUnc/* or si:ellipsoidalRegion or si:rectangularRegion or not(si:complex[not(si:ellipsoidalRegion or si:rectangularRegion)]))])",
                        "message": "[RMC-009] In certified properties blocks, every number nested within a si:hybrid container, as a single quantity or inside a list, MUST include measurement uncertainty, in one of the forms that D-SI provides for it: si:real, si:complex and si:constant as in RMC-006, si:realListXMLList and si:complexListXMLList as in RMC-008, and the lists si:realList, si:complexList and si:list with an uncertainty for the list or for each of its values (ISO 33401:2024, 5.3.3, Property value and associated uncertainty: 'Mandatory' for RM certificate)."
                    }
                ]
            }
        ]
    },
    {
        "id": "pis-document-rules",
        "rules": [
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'productInformationSheet']",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "PIS-001",
                        "role": "error",
                        "test": "not(drmd:propertiesList/drmd:properties[(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')])",
                        "message": "[PIS-001] Product Information Sheets MUST NOT mark any properties block as isCertified=\"true\" (or its equivalent \"1\"). Only reference material certificates, which accompany certified reference materials, may contain certified property values. Setting isCertified=\"true\" on a productInformationSheet document constitutes a misrepresentation of the material's metrological status and violates the ISO 33401:2024 distinction between RMs and CRMs."
                    },
                    {
                        "kind": "assert",
                        "id": "PIS-002",
                        "role": "error",
                        "test": "drmd:propertiesList/drmd:properties/drmd:results/drmd:result",
                        "message": "[PIS-002] Product Information Sheets MUST include results where property values are assigned (ISO 33401:2024, 5.2.15, Property of interest)."
                    }
                ]
            },
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'productInformationSheet'] //drmd:properties",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "PIS-003",
                        "role": "error",
                        "test": "not(normalize-space(@isCertified) = 'true' or normalize-space(@isCertified) = '1')",
                        "message": "[PIS-003] In productInformationSheet documents, individual properties blocks MUST NOT have isCertified=\"true\" (or its equivalent \"1\"). This attribute should be omitted or set to \"false\" for all property blocks in a Product Information Sheet. Certified property values are only permitted in referenceMaterialCertificate documents."
                    }
                ]
            },
            {
                "context": "drmd:digitalReferenceMaterialDocument[ drmd:administrativeData/drmd:coreData/drmd:titleOfTheDocument = 'productInformationSheet'] //drmd:materials/drmd:material",
                "checks": [
                    {
                        "kind": "assert",
                        "id": "PIS-005",
                        "role": "warning",
                        "test": "drmd:description[dcc:content[normalize-space(.) != ''] or dcc:file or dcc:formula]",
                        "message": "[PIS-005] Product Information Sheets SHOULD include a description for each material. While not mandatory for Product Information Sheets, material descriptions improve usability (ISO 33401:2024, 5.3.2, Description of the material: 'Recommended' for product information sheet, 'Mandatory' for RM certificate)."
                    }
                ]
            }
        ]
    }
];
