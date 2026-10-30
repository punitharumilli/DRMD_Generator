// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Units from the certificate → D-SI units, by the rules in ./dsi.ts (D-SI guide v1.3, SmartCom,
 * DOI 10.5281/zenodo.3816686). A value is never changed: a unit is only written as a D-SI unit of
 * exactly the same size, and a unit without such a form is left as it is.
 */

import { toDecimalString } from './xmlValues';
import { toDsi, UnitContext, DsiResult } from './dsi';

export interface DsiConversion {
    dsiUnit: string;
    /** Always 1: values are never scaled. Kept for the callers that multiply by it. */
    factor: 1;
}

/** The D-SI unit for a unit as written, or null when it has no D-SI form of the same size. */
export const resolveDsiUnit = (unit: string | undefined | null, ctx?: UnitContext): DsiConversion | null => {
    if (unit === undefined || unit === null) return null;
    const r = toDsi(String(unit), ctx);
    return r.dsi ? { dsiUnit: r.dsi, factor: 1 } : null;
};

/** The full answer of the rule engine (D-SI unit, quality class, explanation). */
export const dsiFor = (unit: string | undefined | null, ctx?: UnitContext): DsiResult => toDsi(String(unit ?? ''), ctx);

export const convertToDSI = (value: string | undefined | null | number, unit: string | undefined | null, ctx?: UnitContext): { dsiValue: string, dsiUnit: string } => {
    if (unit === undefined || unit === null) return { dsiValue: "", dsiUnit: "" };
    const conversion = resolveDsiUnit(String(unit), ctx);
    if (!conversion) return { dsiValue: "", dsiUnit: "" };
    const valStr = value === undefined || value === null ? "" : String(value).trim();
    // The value as extracted; only a decimal comma becomes a point (the XML needs that), nothing else.
    const num = toDecimalString(valStr);
    return { dsiValue: num !== null ? num : valStr, dsiUnit: conversion.dsiUnit };
};

/**
 * "4.9 g" → "4.9 \gram", "4,9 g" → "4.9 \gram", "5 ppm" → "5 \ppm": exactly what the XML generator
 * writes for a minimum sample size or item quantity. Empty when it is written as text.
 */
export const getDsiPreview = (raw: string): string => {
    const text = String(raw ?? '').trim();
    if (!text) return "";
    const match = text.match(/^(\S+)\s*(\S.*)$/);
    const num = match ? toDecimalString(match[1]) : null;
    const conv = match && num !== null ? resolveDsiUnit(match[2]) : null;
    if (num === null || !conv) return "";
    return `${num} ${conv.dsiUnit}`;
};
