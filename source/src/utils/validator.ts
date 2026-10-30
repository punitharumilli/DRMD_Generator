// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import { DRMD } from '../types';
import { buildDrmdXml } from './xmlGenerator';
import { SCHEMATRON_PATTERNS, SCHEMATRON_NAMESPACES } from './drmdBusinessRules';

/*
 * Validation = the two official DRMD layers, applied to the XML the app actually exports:
 *
 *   1. Schema (drmd.xsd + DCC + D-SI). The generator writes schema-valid structures by construction;
 *      whatever it cannot write validly from the current form data (a missing coverage factor, an
 *      invalid date, an empty address, a second producer ...) it reports as a note, shown here with
 *      an "XSD-" rule id. "DATA-" notes are content checks the schema cannot express.
 *   2. Business rules (drmd-business-rules.sch). The OFFICIAL Schematron assertions — embedded
 *      verbatim in drmdBusinessRules.ts — are evaluated with the browser's XPath engine against the
 *      generated XML, with the same semantics as the schema repository's tools/validate.py
 *      (rule context matched anywhere in the tree, first matching rule per node within a pattern).
 *
 * Because the rules run on the exported XML rather than on the form data, the report cannot drift
 * from what an external DRMD validator will say about the file.
 */

export type ValidationSeverity = 'error' | 'conditional-error' | 'warning';

export interface ValidationIssue {
    ruleId: string;
    severity: ValidationSeverity;
    section: string;
    message: string;
}

export interface ValidationReport {
    errors: ValidationIssue[];
    conditionalErrors: ValidationIssue[];
    warnings: ValidationIssue[];
    isCompliant: boolean;
}

// Which part of the form each official rule is about, for the report's section label.
const RULE_SECTION: Record<string, string> = {
    'DRMD-001': 'Administrative', 'DRMD-010': 'Administrative', 'DRMD-011': 'Administrative', 'DRMD-012': 'Administrative',
    'RMC-010': 'Administrative', 'RMC-012': 'Administrative',
    'DRMD-002': 'Materials', 'DRMD-007': 'Materials', 'DRMD-008': 'Materials', 'DRMD-016': 'Materials',
    'RMC-011': 'Materials', 'PIS-005': 'Materials',
    'DRMD-004': 'Statements', 'DRMD-005': 'Statements', 'DRMD-006': 'Statements', 'DRMD-013': 'Statements',
    'DRMD-015': 'Statements', 'RMC-001': 'Statements',
};
const sectionOf = (ruleId: string) => RULE_SECTION[ruleId] || 'Properties';

const firstText = (doc: Document, node: Node, xpath: string, resolver: XPathNSResolver): string => {
    try {
        return (doc.evaluate(`string(${xpath})`, node, resolver, XPathResult.STRING_TYPE, null).stringValue || '').trim();
    } catch {
        return '';
    }
};

// A short human pointer to the element a rule fired on (which material, which table ...).
const describeNode = (doc: Document, node: Node, resolver: XPathNSResolver): string => {
    const local = (node as Element).localName;
    if (local === 'material') {
        const name = firstText(doc, node, 'drmd:name/dcc:content[1]', resolver);
        return name ? ` (material "${name}")` : '';
    }
    if (local === 'properties') {
        const name = firstText(doc, node, 'drmd:name/dcc:content[1]', resolver);
        return name ? ` (properties block "${name}")` : '';
    }
    if (local === 'quantity') {
        const name = firstText(doc, node, 'dcc:name/dcc:content[1]', resolver);
        const block = firstText(doc, node, 'ancestor::drmd:properties[1]/drmd:name/dcc:content[1]', resolver);
        return name || block ? ` (${name ? `row "${name}"` : 'a row'}${block ? ` in "${block}"` : ''})` : '';
    }
    return '';
};

/**
 * Runs the official DRMD Schematron business rules on a DRMD XML string.
 * Mirrors tools/validate.py from the schema repository.
 */
export function runBusinessRules(xml: string): ValidationIssue[] {
    if (typeof DOMParser === 'undefined' || typeof XPathResult === 'undefined') {
        return [{
            ruleId: 'SCHEMATRON',
            severity: 'warning',
            section: 'Validation',
            message: 'The DRMD business rules could not be run in this environment (no XML/XPath support).',
        }];
    }
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        return [{
            ruleId: 'XML-WELLFORMED',
            severity: 'error',
            section: 'Validation',
            message: `The generated XML is not well-formed: ${doc.getElementsByTagName('parsererror')[0].textContent?.slice(0, 200)}`,
        }];
    }
    const resolver: XPathNSResolver = ((prefix: string | null) => (prefix && SCHEMATRON_NAMESPACES[prefix]) || null) as any;

    const issues: ValidationIssue[] = [];
    for (const pattern of SCHEMATRON_PATTERNS) {
        // Within one pattern, a node is handled by the FIRST rule whose context matches it.
        const seen = new Set<Node>();
        for (const rule of pattern.rules) {
            const select = rule.context.startsWith('/') || rule.context.startsWith('(') ? rule.context : `//${rule.context}`;
            const nodes = doc.evaluate(select, doc, resolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < nodes.snapshotLength; i++) {
                const node = nodes.snapshotItem(i)!;
                if (seen.has(node)) continue;
                seen.add(node);
                for (const check of rule.checks) {
                    const holds = doc.evaluate(`boolean(${check.test})`, node, resolver, XPathResult.BOOLEAN_TYPE, null).booleanValue;
                    const fired = check.kind === 'assert' ? !holds : holds;
                    if (fired) {
                        issues.push({
                            ruleId: check.id,
                            severity: check.role,
                            section: sectionOf(check.id),
                            message: check.message.replace(/^\[[A-Z]+-\d+\]\s*/, '') + describeNode(doc, node, resolver),
                        });
                    }
                }
            }
        }
    }
    return issues;
}

// The report only changes when the document does; React re-renders reuse it.
const reportCache = new WeakMap<DRMD, ValidationReport>();

export function validateDrmd(data: DRMD): ValidationReport {
    const cached = reportCache.get(data);
    if (cached) return cached;

    // Same XML as the export, minus the embedded PDF (irrelevant to every rule, and large).
    const { xml, notes } = buildDrmdXml(data, { includeDocuments: false, includeAnnotations: false });

    const issues: ValidationIssue[] = [
        ...notes.map(n => ({ ruleId: n.code, severity: n.severity, section: n.section, message: n.message } as ValidationIssue)),
        ...runBusinessRules(xml),
    ];

    const order: Record<string, number> = { Administrative: 0, Materials: 1, Properties: 2, Statements: 3, Validation: 4 };
    const bySection = (a: ValidationIssue, b: ValidationIssue) => (order[a.section] ?? 9) - (order[b.section] ?? 9);
    const errors = issues.filter((i) => i.severity === 'error').sort(bySection);
    const conditionalErrors = issues.filter((i) => i.severity === 'conditional-error').sort(bySection);
    const warnings = issues.filter((i) => i.severity === 'warning').sort(bySection);

    const report: ValidationReport = {
        errors,
        conditionalErrors,
        warnings,
        isCompliant: errors.length === 0,
    };
    reportCache.set(data, report);
    return report;
}
