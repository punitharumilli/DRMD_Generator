// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Requests per minute (RPM), per API key and model.
 *
 * Every provider limits how many requests one key may send to a model per minute. A request over the
 * limit is refused with HTTP 429, and such refusals are what left fields empty (a look-up or a unit
 * check that could not be made). This tracker counts the requests of the last 60 seconds and, once a
 * model's limit is known, holds the next request back until it fits, instead of sending it into a 429.
 *
 * Limits are learned, never guessed:
 *  - from the provider's answer to a 429: Gemini names the per-minute quota and its value;
 *  - from the rate-limit headers a provider lets the browser read (OpenAI-style
 *    x-ratelimit-limit-requests, Anthropic's anthropic-ratelimit-requests-limit);
 *  - failing both, from the number of requests the model accepted in the minute before the 429.
 *
 * Nothing is stored: the numbers exist only in this tab. API keys are not kept here; a short
 * non-reversible fingerprint tells two keys apart.
 */

const WINDOW_MS = 60000;
const SAFETY_MS = 1500;

export interface RpmLimit { rpm: number; source: 'quota' | 'headers' | 'observed' }

interface Track { provider: string; model: string; sent: number[]; limit?: RpmLimit }
const tracks = new Map<string, Track>();
const listeners = new Set<() => void>();
let version = 0;

/** FNV-1a: a fingerprint of the key, so that the key itself is not kept in another table. */
const fingerprint = (apiKey: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < apiKey.length; i++) { h ^= apiKey.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
};

const trackFor = (provider: string, apiKey: string, model: string): Track => {
    const k = `${provider}|${fingerprint(apiKey)}|${model}`;
    let t = tracks.get(k);
    if (!t) { t = { provider, model, sent: [] }; tracks.set(k, t); }
    return t;
};

const prune = (t: Track, now = Date.now()) => { while (t.sent.length && now - t.sent[0] >= WINDOW_MS) t.sent.shift(); };
const changed = () => { version++; listeners.forEach(fn => { try { fn(); } catch { /* a listener must not break a request */ } }); };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Waits until one more request to this model fits into its known per-minute limit. Returns false
 * (without waiting) when that would take longer than maxWaitMs. Without a known limit it returns at once.
 */
export const waitForSlot = async (
    provider: string, apiKey: string, model: string, maxWaitMs: number,
    onWait?: (waitMs: number, rpm: number) => void,
): Promise<boolean> => {
    const t = trackFor(provider, apiKey, model);
    for (;;) {
        const limit = t.limit?.rpm;
        if (!limit) return true;
        const now = Date.now();
        prune(t, now);
        if (t.sent.length < limit) return true;
        // 1.5 s more than the minute: the provider counts when a request arrives, and a request that
        // left late or travelled slower than the next one would otherwise still be in its window
        const waitMs = t.sent[t.sent.length - limit] + WINDOW_MS - now + SAFETY_MS;
        if (waitMs > maxWaitMs) return false;
        onWait?.(waitMs, limit);
        await sleep(waitMs);
    }
};

/** Counts a request as sent now. */
export const recordRequest = (provider: string, apiKey: string, model: string): void => {
    const t = trackFor(provider, apiKey, model);
    prune(t);
    t.sent.push(Date.now());
    changed();
};

const setLimit = (t: Track, rpm: number, source: RpmLimit['source']) => {
    if (!Number.isFinite(rpm) || rpm < 1) return;
    const value = Math.floor(rpm);
    // A limit stated by the provider replaces an observed one; an observed one only ever goes down.
    if (source === 'observed' && t.limit && (t.limit.source !== 'observed' || t.limit.rpm <= value)) return;
    if (t.limit?.rpm === value && t.limit.source === source) return;
    t.limit = { rpm: value, source };
    changed();
};

/** Gemini's 429 names the quota: quotaId "...PerMinute..." (requests) and quotaValue. */
const quotaFromGemini = (text: string): number | null => {
    const re = /quotaId\\*"?\s*:\s*\\*"([^"\\]+)\\*"[\s\S]{0,600}?quotaValue\\*"?\s*:\s*\\*"?(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        if (/PerMinute/i.test(m[1]) && /Request/i.test(m[1]) && !/Token/i.test(m[1])) return Number(m[2]);
    }
    return null;
};

/**
 * Learns the limit from a 429. `daily`: a per-day quota, which says nothing about requests per minute.
 */
export const learnFromRateLimit = (provider: string, apiKey: string, model: string, error: any, daily: boolean): void => {
    if (daily) return;
    const t = trackFor(provider, apiKey, model);
    const text = [error?.message, error?.details, error?.response].map(v => (typeof v === 'string' ? v : v ? JSON.stringify(v) : '')).join(' ');
    const stated = quotaFromGemini(text);
    if (stated) { setLimit(t, stated, 'quota'); return; }
    if (typeof error?.rpmLimit === 'number') { setLimit(t, error.rpmLimit, 'headers'); return; }
    // Token-per-minute limits also answer 429; only a request count says something about RPM
    if (/token/i.test(text) && !/request/i.test(text)) return;
    prune(t);
    const accepted = t.sent.length - 1; // the refused request was counted when it was sent
    if (accepted >= 1) setLimit(t, accepted, 'observed');
};

/** Rate-limit headers of a provider's answer, when the provider lets the browser read them. */
export const learnFromHeaders = (provider: string, apiKey: string, model: string, headers: Headers | null | undefined): number | null => {
    if (!headers || !model) return null;
    const read = (name: string) => { const v = Number(headers.get(name)); return Number.isFinite(v) && v > 0 ? v : null; };
    const rpm = read('anthropic-ratelimit-requests-limit') ?? read('x-ratelimit-limit-requests');
    if (rpm) setLimit(trackFor(provider, apiKey, model), rpm, 'headers');
    return rpm;
};

/**
 * Forgets the limits that were only observed (counted before a 429) for this key. Called when the user
 * starts a run: the key may have a higher limit by now. Limits stated by the provider are kept.
 */
export const forgetObservedLimits = (apiKey: string): void => {
    const fp = fingerprint(apiKey);
    let any = false;
    tracks.forEach((t, k) => { if (k.split('|')[1] === fp && t.limit?.source === 'observed') { t.limit = undefined; any = true; } });
    if (any) changed();
};

export interface RpmRow { provider: string; model: string; lastMinute: number; limit?: RpmLimit }

/** Requests in the last minute and the known limit, per model (for the usage panel). */
export const rpmSnapshot = (): RpmRow[] => {
    const now = Date.now();
    return Array.from(tracks.values()).map(t => { prune(t, now); return { provider: t.provider, model: t.model, lastMinute: t.sent.length, limit: t.limit }; });
};

export const rpmVersion = () => version;

export const subscribeRpm = (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
};
