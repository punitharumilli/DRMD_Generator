// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Token use and cost of the AI requests made in this tab. Nothing is stored or sent anywhere:
 * the numbers live in memory and are gone when the tab is closed or reloaded.
 */
import { ProviderId, ReportedUsage } from './providers';
import { costOf, Cost } from './pricing';

export interface UsageEntry {
    at: number;
    provider: ProviderId;
    /** Providers with regions (Qwen): the region the request went to. */
    region?: string;
    model: string;
    /** What the request was for, e.g. "Extraction", "ROR ID", "CAS / InChIKey". */
    purpose: string;
    /** The PDF the request was about, when known. */
    doc?: string;
    usage: ReportedUsage;
    cost: Cost;
    durationMs: number;
}

export interface UsageTotal {
    provider: ProviderId;
    region?: string;
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedTokens: number;
    /** Sum of the costs that are known. */
    usd: number;
    /** Requests whose cost could not be worked out (no published price). */
    unpriced: number;
    /** Requests whose cost the provider stated itself. */
    providerPriced: number;
    durationMs: number;
}

const RECENT_LIMIT = 50;
const totals = new Map<string, UsageTotal>();
let recent: UsageEntry[] = [];
const listeners = new Set<() => void>();
let version = 0;

export const recordUsage = (e: Omit<UsageEntry, 'cost'>): UsageEntry => {
    const entry: UsageEntry = { ...e, cost: costOf(e.provider, e.model, e.usage, new Date(e.at), e.region) };
    const key = `${e.provider}|${e.region || ''}|${e.model}`;
    const t = totals.get(key) || { provider: e.provider, region: e.region, model: e.model, requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, usd: 0, unpriced: 0, providerPriced: 0, durationMs: 0 };
    t.requests++;
    t.inputTokens += e.usage.inputTokens;
    t.outputTokens += e.usage.outputTokens;
    t.reasoningTokens += e.usage.reasoningTokens || 0;
    t.cachedTokens += e.usage.cachedTokens || 0;
    if (entry.cost.usd === null) t.unpriced++; else t.usd += entry.cost.usd;
    if (entry.cost.source === 'provider') t.providerPriced++;
    t.durationMs += e.durationMs;
    totals.set(key, t);
    recent = [entry, ...recent].slice(0, RECENT_LIMIT);
    version++;
    listeners.forEach(fn => { try { fn(); } catch { /* a listener must not break a request */ } });
    return entry;
};

export const usageSnapshot = () => ({ version, totals: Array.from(totals.values()), recent });

export const clearUsage = () => {
    totals.clear();
    recent = [];
    version++;
    listeners.forEach(fn => fn());
};

export const subscribeUsage = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
};
