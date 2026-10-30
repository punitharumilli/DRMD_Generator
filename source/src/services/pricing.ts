// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Cost of a request in US dollars.
 *
 * Token counts always come from the provider's answer. OpenRouter states the charge in the answer
 * itself, and that figure is used as is. Google, OpenAI, Anthropic, Mistral and Alibaba Cloud do not,
 * so the cost is the reported tokens multiplied by the list prices on the provider's own pricing page,
 * as checked on the date below. Prices change: check them (and this table) every three months.
 * Not included: free-tier use (not billed), discounts (including Alibaba Cloud's limited-time and
 * night-time discounts), taxes, and requests the generator stopped waiting for (time-outs), which a
 * provider may still bill.
 */
import { ProviderId, ReportedUsage } from './providers';

export const PRICES_CHECKED = '26 October 2026';

interface Rate {
    /** USD per 1M input tokens */
    input: number;
    /** USD per 1M cached input tokens read (cache hit) */
    cached?: number;
    /** USD per 1M cache-write tokens */
    cacheWrite?: number;
    /** USD per 1M output tokens (including reasoning / thinking tokens) */
    output: number;
}

interface PriceEntry {
    provider: ProviderId;
    /** Model ids this price is for (exact, or exact followed by "-<date or version>"). */
    models: string[];
    rate: Rate;
    /** A larger prompt is billed at other rates: the last tier whose `above` the input token count exceeds. */
    tiers?: { above: number; rate: Rate }[];
    /** Providers with regions (Qwen): the region these prices are for. */
    region?: string;
    /** First and last day the price applies (ISO dates, inclusive). */
    from?: string;
    until?: string;
    source: string;
}

const GEMINI = 'https://ai.google.dev/gemini-api/docs/pricing';
const OPENAI = 'https://developers.openai.com/api/docs/pricing';
const ANTHROPIC = 'https://platform.claude.com/docs/en/about-claude/pricing';
const MISTRAL = 'https://mistral.ai/pricing';
const QWEN = 'https://www.alibabacloud.com/help/en/model-studio/model-pricing';

const PRICES: PriceEntry[] = [
    // Google Gemini (paid tier, Standard). Google states the Flash prices double on 1 January 2027.
    { provider: 'gemini', models: ['gemini-3.8-flash', 'gemini-3.6-flash'], rate: { input: 0.75, cached: 0.075, output: 3.75 }, until: '2026-12-31', source: GEMINI },
    { provider: 'gemini', models: ['gemini-3.8-flash', 'gemini-3.6-flash'], rate: { input: 1.50, cached: 0.15, output: 7.50 }, from: '2027-01-01', source: GEMINI },
    { provider: 'gemini', models: ['gemini-3.5-flash-lite'], rate: { input: 0.30, cached: 0.03, output: 2.50 }, source: GEMINI },
    { provider: 'gemini', models: ['gemini-3.1-flash-lite'], rate: { input: 0.25, cached: 0.025, output: 1.50 }, source: GEMINI },
    { provider: 'gemini', models: ['gemini-3.1-pro-preview'], rate: { input: 2.00, cached: 0.20, output: 12.00 },
      tiers: [{ above: 200000, rate: { input: 4.00, cached: 0.40, output: 18.00 } }], source: GEMINI },
    // OpenAI (Standard). Prompts over 272K tokens: input and cached input x2, output x1.5.
    { provider: 'openai', models: ['gpt-6-astra'], rate: { input: 10.00, cached: 1.00, output: 50.00 },
      tiers: [{ above: 272000, rate: { input: 20.00, cached: 2.00, output: 75.00 } }], source: OPENAI },
    { provider: 'openai', models: ['gpt-6.1-sol'], rate: { input: 2.00, cached: 0.10, output: 10.00 },
      tiers: [{ above: 272000, rate: { input: 4.00, cached: 0.20, output: 15.00 } }], source: OPENAI },
    { provider: 'openai', models: ['gpt-6-luna'], rate: { input: 0.10, cached: 0.01, output: 0.50 },
      tiers: [{ above: 272000, rate: { input: 0.20, cached: 0.02, output: 0.75 } }], source: OPENAI },
    // Anthropic (standard). Haiku 5.5 prompts over 100K tokens are billed at higher prices.
    { provider: 'anthropic', models: ['claude-haiku-5-5'], rate: { input: 0.10, cacheWrite: 0.125, cached: 0.01, output: 0.50 },
      tiers: [{ above: 100000, rate: { input: 0.50, cacheWrite: 0.625, cached: 0.05, output: 2.50 } }], source: ANTHROPIC },
    { provider: 'anthropic', models: ['claude-sonnet-5-5'], rate: { input: 2.00, cacheWrite: 2.50, cached: 0.10, output: 10.00 }, source: ANTHROPIC },
    { provider: 'anthropic', models: ['claude-opus-5-5'], rate: { input: 4.00, cacheWrite: 5.00, cached: 0.20, output: 20.00 }, source: ANTHROPIC },
    { provider: 'anthropic', models: ['claude-fable-5-1'], rate: { input: 10.00, cacheWrite: 12.50, cached: 0.25, output: 50.00 }, source: ANTHROPIC },
    // Mistral (model cards on docs.mistral.ai). Document processing may be billed per page in addition.
    { provider: 'mistral', models: ['mistral-medium-latest', 'mistral-medium-2604', 'mistral-medium-3-5'], rate: { input: 1.50, output: 7.50 }, source: MISTRAL },
    { provider: 'mistral', models: ['mistral-small-latest', 'mistral-small-2603'], rate: { input: 0.15, output: 0.60 }, source: MISTRAL },
    // Alibaba Cloud Model Studio, prices per region. Tiers by the input tokens of the request. List prices:
    // limited-time discounts (qwen3.7-plus: 20 % off at the time of checking) are not applied.
    // US (Virginia) is not listed: its price depends on the workspace's deployment scope (Global or US),
    // which the generator cannot see.
    { provider: 'qwen', region: 'sg', models: ['qwen3.8-flash'], rate: { input: 0.15, output: 0.47 }, source: QWEN },
    { provider: 'qwen', region: 'sg', models: ['qwen3.7-flash'], rate: { input: 0.03, output: 0.13 },
      tiers: [{ above: 32000, rate: { input: 0.10, output: 0.40 } }, { above: 256000, rate: { input: 0.20, output: 0.80 } }], source: QWEN },
    { provider: 'qwen', region: 'sg', models: ['qwen3.7-plus'], rate: { input: 0.40, output: 1.60 },
      tiers: [{ above: 256000, rate: { input: 1.20, output: 4.80 } }], source: QWEN },
    { provider: 'qwen', region: 'sg', models: ['qwen3.6-plus'], rate: { input: 0.50, output: 3.00 },
      tiers: [{ above: 256000, rate: { input: 2.00, output: 6.00 } }], source: QWEN },
    { provider: 'qwen', region: 'sg', models: ['qwen3.8-max'], rate: { input: 2.00, output: 6.00 }, source: QWEN },
    { provider: 'qwen', region: 'cn', models: ['qwen3.8-flash'], rate: { input: 0.113, output: 0.382 }, source: QWEN },
    { provider: 'qwen', region: 'cn', models: ['qwen3.7-flash'], rate: { input: 0.028, output: 0.110 },
      tiers: [{ above: 32000, rate: { input: 0.083, output: 0.330 } }, { above: 256000, rate: { input: 0.165, output: 0.660 } }], source: QWEN },
    { provider: 'qwen', region: 'cn', models: ['qwen3.7-plus'], rate: { input: 0.276, output: 1.101 },
      tiers: [{ above: 256000, rate: { input: 0.826, output: 3.301 } }], source: QWEN },
    { provider: 'qwen', region: 'cn', models: ['qwen3.8-max'], rate: { input: 1.65, output: 4.951 }, source: QWEN },
];

const matches = (entryModel: string, model: string) =>
    model === entryModel || (model.startsWith(entryModel + '-') && /^[-\d.]+$/.test(model.slice(entryModel.length)));

const findPrice = (provider: ProviderId, model: string, at: Date, region?: string): PriceEntry | undefined => {
    const day = at.toISOString().slice(0, 10);
    const id = model.replace(/^models\//, '');
    return PRICES.find(p => p.provider === provider
        && (p.region === undefined || p.region === region)
        && p.models.some(m => matches(m, id))
        && (!p.from || day >= p.from)
        && (!p.until || day <= p.until));
};

export interface Cost {
    usd: number | null;
    /** 'provider' = stated by the provider in its answer; 'price-list' = tokens x list price; 'unknown' = no published price. */
    source: 'provider' | 'price-list' | 'unknown';
}

export const costOf = (provider: ProviderId, model: string, usage: ReportedUsage, at: Date = new Date(), region?: string): Cost => {
    if (typeof usage.providerCostUsd === 'number') return { usd: usage.providerCostUsd, source: 'provider' };
    const entry = findPrice(provider, model, at, region);
    if (!entry) return { usd: null, source: 'unknown' };
    let rate = entry.rate;
    for (const tier of entry.tiers || []) if (usage.inputTokens > tier.above) rate = tier.rate;
    const cached = usage.cachedTokens || 0;
    const written = usage.cacheWriteTokens || 0;
    const plainInput = Math.max(0, usage.inputTokens - cached - written);
    const usd = (plainInput * rate.input
        + cached * (rate.cached ?? rate.input)
        + written * (rate.cacheWrite ?? rate.input)
        + usage.outputTokens * rate.output) / 1e6;
    return { usd, source: 'price-list' };
};

export const priceSourceUrl = (provider: ProviderId, model: string, at: Date = new Date(), region?: string): string | undefined =>
    findPrice(provider, model, at, region)?.source;
