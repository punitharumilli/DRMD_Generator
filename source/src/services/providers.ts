// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * AI providers the generator can use. Every provider here
 *  - has models that read PDF documents (text and page images) or page images,
 *  - answers requests made directly from a browser page (checked live, October 2026),
 *  - is reached at fixed addresses that are listed in the page's security policy.
 *
 * The extraction prompts and schemas are the same for every provider (see llmService.ts). This
 * module only turns a request into each provider's format and the answer back into the shape the
 * rest of the generator already understands (text, finish reason, token counts).
 *
 * An API key is only ever sent to its own provider's address, in that provider's auth header.
 */

import { learnFromHeaders } from './rateLimit';
import { pdfToPages } from './pdfPages';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'mistral' | 'qwen' | 'openrouter';

export const PROVIDER_IDS: ProviderId[] = ['gemini', 'openai', 'anthropic', 'mistral', 'qwen', 'openrouter'];

/** One model offered in the model list of a provider. */
export interface ModelOption {
    id: string;
    label: string;
    /** OpenRouter only: the model reads images but not PDFs, so OpenRouter converts the PDF first (extra fee). */
    ocr?: boolean;
    /** Largest answer the model can give, when the provider says so. */
    maxOutput?: number;
}

/** What a request needs: which provider, the key, and the model (or 'auto'). */
export interface LlmConnection {
    provider: ProviderId;
    apiKey: string;
    /** 'auto' = the provider's recommended models in order; otherwise one model id. */
    model: string;
    /** Models the key can use, from "Check key" (empty or missing = not checked yet). */
    available?: ModelOption[];
    /** For providers with several regions (Qwen): the region id; the key belongs to that region. */
    region?: string;
}

/** A region of a provider with its own address, keys, models and prices (Alibaba Cloud). */
export interface ProviderRegion {
    id: string;
    label: string;
    origin: string;
}

export const AUTO = 'auto';

export interface ProviderInfo {
    id: ProviderId;
    label: string;
    company: string;
    keyPlaceholder: string;
    keyUrl: string;
    /** Recommended models, tried in this order. */
    autoChain: string[];
    /** One sentence on what "Automatic" does. */
    autoNote: string;
    /** How the provider treats what is sent to it (from its own terms). */
    dataNote: string;
    /** What the provider itself publishes about response times. */
    latencyNote: string;
    availabilityUrl?: string;
    /** Link text for availabilityUrl (default: "Countries where it is available"). */
    availabilityLabel?: string;
    /** How the PDF reaches the model, when it is not sent as a PDF file. */
    inputNote?: string;
    pricingUrl: string;
    /** The only address this provider's key is ever sent to (the first region's, for providers with regions). */
    origin: string;
    /** Providers with regions: the key is sent only to the address of the region chosen in AI settings. */
    regions?: ProviderRegion[];
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
    gemini: {
        id: 'gemini',
        label: 'Google Gemini',
        company: 'Google',
        keyPlaceholder: 'AIza…',
        keyUrl: 'https://aistudio.google.com/apikey',
        // gemini-3.6-flash first: same price as gemini-3.8-flash, but it writes its answer more than twice as
        // fast (OpenRouter's measured median, October 2026: 186 against 74 to 86 tokens per second), and a
        // certificate answer is long. gemini-3.8-flash made one extraction take about three minutes.
        autoChain: ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'],
        autoNote: 'Uses gemini-3.6-flash; if it is busy or rate limited, gemini-3.8-flash, then gemini-3.5-flash-lite.',
        dataNote: "With a free key, Google's terms allow Google to use what is sent to improve its products (not in the EEA, the UK and Switzerland). For confidential documents, use a key with billing enabled.",
        latencyNote: 'Google publishes no response times for the Gemini API. Its model list describes gemini-3.5-flash-lite as the fastest model and gemini-3.6-flash as balancing speed and multimodal capabilities.',
        availabilityUrl: 'https://ai.google.dev/gemini-api/docs/available-regions',
        pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
        origin: 'https://generativelanguage.googleapis.com',
    },
    openai: {
        id: 'openai',
        label: 'OpenAI',
        company: 'OpenAI',
        keyPlaceholder: 'sk-…',
        keyUrl: 'https://platform.openai.com/api-keys',
        autoChain: ['gpt-6-luna', 'gpt-6.1-sol'],
        autoNote: 'Uses gpt-6-luna (efficient, low cost); if it is busy or rate limited, gpt-6.1-sol.',
        dataNote: 'OpenAI does not use API data to train its models. It keeps abuse-monitoring logs for up to 30 days.',
        latencyNote: "OpenAI's model pages rate gpt-6-luna and gpt-6.1-sol as \"Fast\". It publishes no response times; its faster paid modes are not used here.",
        availabilityUrl: 'https://developers.openai.com/api/docs/supported-countries',
        pricingUrl: 'https://developers.openai.com/api/docs/pricing',
        origin: 'https://api.openai.com',
    },
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic Claude',
        company: 'Anthropic',
        keyPlaceholder: 'sk-ant-…',
        keyUrl: 'https://platform.claude.com/settings/keys',
        autoChain: ['claude-haiku-5-5', 'claude-sonnet-5-5'],
        autoNote: 'Uses claude-haiku-5-5 (fastest and lowest cost); if it is busy or rate limited, claude-sonnet-5-5.',
        dataNote: 'Anthropic does not use API inputs and outputs to train its models by default.',
        latencyNote: "Anthropic's model overview rates Haiku 5.5 as fastest, Sonnet 5.5 as fast, Opus 5.5 as moderate and Fable 5.1 as slower. It publishes no response times.",
        availabilityUrl: 'https://www.anthropic.com/supported-countries',
        pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
        origin: 'https://api.anthropic.com',
    },
    mistral: {
        id: 'mistral',
        label: 'Mistral AI',
        company: 'Mistral AI (France)',
        keyPlaceholder: 'Mistral API key',
        keyUrl: 'https://console.mistral.ai/api-keys',
        autoChain: ['mistral-medium-latest', 'mistral-small-latest'],
        autoNote: 'Uses mistral-medium-latest; if it is busy or rate limited, mistral-small-latest. Check the key to use only models that read images.',
        dataNote: 'Mistral may use API data to improve its services unless "Anonymous improvement data" is turned off in its console (Admin, Privacy). Mistral may also charge document processing per page.',
        latencyNote: 'Mistral publishes no response times for these models.',
        pricingUrl: 'https://mistral.ai/pricing',
        origin: 'https://api.mistral.ai',
    },
    qwen: {
        id: 'qwen',
        label: 'Qwen',
        company: 'Alibaba Cloud Model Studio',
        keyPlaceholder: 'sk-…',
        keyUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key',
        autoChain: ['qwen3.8-flash', 'qwen3.7-plus'],
        autoNote: 'Uses qwen3.8-flash (efficient, low cost); if it is busy or rate limited, qwen3.7-plus.',
        inputNote: 'Qwen models read images, not PDF files. The generator draws each page as an image (about 2,600 tokens per page) and adds the text of the PDF, so the model gets both, as the other providers do with the PDF itself.',
        dataNote: 'Alibaba Cloud (China) states that Model Studio does not use customer business data to improve its models without explicit consent. What is sent is stored in the region chosen below; where the model runs depends on the deployment scope of your Model Studio workspace, and the "Global" scope can use nodes in any country, including mainland China. Check whether your organisation allows this provider.',
        latencyNote: 'Alibaba Cloud publishes no response times. It ends requests that take longer than 300 seconds.',
        availabilityUrl: 'https://www.alibabacloud.com/help/en/model-studio/regions',
        availabilityLabel: 'Regions',
        pricingUrl: 'https://www.alibabacloud.com/help/en/model-studio/model-pricing',
        origin: 'https://dashscope-intl.aliyuncs.com',
        // Only the regions whose addresses answer requests made from a web page (checked October 2026).
        // Alibaba Cloud's Germany (Frankfurt), Japan (Tokyo) and Hong Kong addresses did not.
        regions: [
            { id: 'sg', label: 'Singapore (international)', origin: 'https://dashscope-intl.aliyuncs.com' },
            { id: 'us', label: 'US (Virginia)', origin: 'https://dashscope-us.aliyuncs.com' },
            { id: 'cn', label: 'China (Beijing), for mainland China', origin: 'https://dashscope.aliyuncs.com' },
        ],
    },
    openrouter: {
        id: 'openrouter',
        label: 'OpenRouter',
        company: 'OpenRouter (one key for models of many companies)',
        keyPlaceholder: 'sk-or-…',
        keyUrl: 'https://openrouter.ai/settings/keys',
        autoChain: ['google/gemini-3.6-flash', 'anthropic/claude-haiku-5.5', 'openai/gpt-6-luna'],
        autoNote: 'OpenRouter tries google/gemini-3.6-flash, then anthropic/claude-haiku-5.5, then openai/gpt-6-luna, in one request.',
        dataNote: 'OpenRouter does not store prompts by default and passes the request to the model\'s company. The generator asks it to use only providers that do not collect the data.',
        latencyNote: 'OpenRouter shows the measured latency of each model on its website. When a model fails and the next one is tried, the request takes longer.',
        pricingUrl: 'https://openrouter.ai/models',
        origin: 'https://openrouter.ai',
    },
};

/** "auto" plus a model id list → the models to try, in order. */
export const chainFor = (conn: LlmConnection): string[] => {
    if (conn.model && conn.model !== AUTO) return [conn.model];
    // OpenRouter does its own fallback across the recommended models in a single request.
    if (conn.provider === 'openrouter') return [AUTO];
    const chain = PROVIDERS[conn.provider].autoChain;
    const available = (conn.available || []).map(m => m.id);
    if (available.length === 0) return chain;
    const usable = chain.filter(m => available.includes(m));
    if (usable.length > 0) return usable;
    // None of the recommended models is offered to this key (e.g. in another region): use the key's
    // own first two models, which "Check key" sorted newest first.
    return available.slice(0, 2);
};

/** The address requests of this connection go to (the chosen region's, for Qwen). */
export const originFor = (provider: ProviderId, region?: string): string => {
    const info = PROVIDERS[provider];
    return info.regions?.find(r => r.id === region)?.origin || info.origin;
};

/** Every address a provider's key may go to (all its regions). */
const allowedOrigins = (provider: ProviderId): string[] =>
    PROVIDERS[provider].regions?.map(r => r.origin) || [PROVIDERS[provider].origin];

const allowedUrl = (provider: ProviderId, url: string): boolean =>
    allowedOrigins(provider).some(o => url.startsWith(o + '/'));

/** How a model of the chain is named in status messages. */
export const modelLabel = (conn: LlmConnection, model: string): string =>
    model === AUTO ? `${PROVIDERS[conn.provider].label} (${PROVIDERS[conn.provider].autoChain.join(', ')})` : model;

// ─────────────────────────────── Schemas ───────────────────────────────

/**
 * The extraction schema is written for Gemini (Type.OBJECT, nullable, minItems "1"). Other providers
 * take standard JSON Schema. Same fields, same nesting, same required lists.
 */
export const toJsonSchema = (s: any): any => {
    if (!s || typeof s !== 'object') return s;
    const out: any = {};
    const type = typeof s.type === 'string' ? s.type.toLowerCase() : undefined;
    if (type) out.type = s.nullable ? [type, 'null'] : type;
    if (s.description) out.description = s.description;
    if (Array.isArray(s.enum)) out.enum = s.enum;
    if (s.properties) {
        out.properties = {};
        for (const [k, v] of Object.entries(s.properties)) out.properties[k] = toJsonSchema(v);
    }
    if (Array.isArray(s.required)) out.required = [...s.required];
    if (s.items) out.items = toJsonSchema(s.items);
    if (s.minItems !== undefined) out.minItems = Number(s.minItems);
    return out;
};

/**
 * For providers that do not enforce a schema themselves, the schema is added as one extra block
 * after the request text. The generator's own prompt text is not changed.
 */
export const schemaInstruction = (jsonSchema: any): string =>
    'Answer with one JSON object only, with no text before or after it. ' +
    'It must follow this JSON Schema (field names, nesting and types):\n' +
    JSON.stringify(jsonSchema);

// ─────────────────────────────── Requests ───────────────────────────────

/** The request as llmService writes it (Gemini style). */
export interface GenerateParams {
    contents: string | { parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> };
    config?: { systemInstruction?: string; responseMimeType?: string; responseSchema?: any; maxOutputTokens?: number };
}

/** Token counts as the provider reported them, plus the cost when the provider reports it itself. */
export interface ReportedUsage {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    cachedTokens?: number;
    cacheWriteTokens?: number;
    /** USD, only when the provider states the charge in its answer (OpenRouter). */
    providerCostUsd?: number;
}

/** The answer in the shape llmService reads (the same fields as a Gemini SDK response). */
export interface ProviderResponse {
    text: string;
    candidates: Array<{ finishReason: string }>;
    usageMetadata: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
    __model: string;
    __usage: ReportedUsage;
}

/** Error with what the retry logic needs to decide (status, wait time, billing, network). */
export class ProviderError extends Error {
    status?: number;
    retryAfterMs?: number;
    /** Out of credit / billing problem: waiting does not help. */
    billing?: boolean;
    /** Network failure or no readable answer: worth retrying. */
    transient?: boolean;
    constructor(message: string, init: { status?: number; retryAfterMs?: number; billing?: boolean; transient?: boolean } = {}) {
        super(message);
        this.name = 'ProviderError';
        Object.assign(this, init);
    }
}

const splitParams = (params: GenerateParams) => {
    const system = params.config?.systemInstruction;
    let pdf: { mimeType: string; data: string } | undefined;
    const texts: string[] = [];
    if (typeof params.contents === 'string') {
        texts.push(params.contents);
    } else {
        for (const part of params.contents.parts) {
            if (part.inlineData) pdf = part.inlineData;
            if (typeof part.text === 'string') texts.push(part.text);
        }
    }
    const jsonSchema = params.config?.responseSchema ? toJsonSchema(params.config.responseSchema) : undefined;
    return { system, pdf, text: texts.join('\n\n'), jsonSchema, maxOutputTokens: params.config?.maxOutputTokens };
};

/**
 * Error texts are shown on screen and in the console. Some providers repeat part of the key in them
 * (OpenAI: "Incorrect API key provided: sk-proj-****abcd"), so the key and such masked forms are removed.
 */
const hideKey = (text: string, apiKey: string): string => {
    let t = text;
    if (apiKey && apiKey.length >= 8) t = t.split(apiKey).join('[key hidden]');
    return t.replace(/\b[A-Za-z0-9_-]{2,}\*{3,}[A-Za-z0-9_-]{0,}/g, '[key hidden]');
};

/** Reads the provider's error answer into one sentence, with the flags the retry logic uses. */
const toProviderError = async (provider: ProviderId, res: Response, apiKey: string): Promise<ProviderError> => {
    let message = '';
    let code = '';
    try {
        const body: any = await res.json();
        const e = body?.error;
        message = (typeof e === 'string' ? e : e?.message) || body?.message || body?.detail || '';
        if (typeof message !== 'string') message = JSON.stringify(message);
        code = String(e?.code || e?.type || body?.code || body?.type || '');
    } catch { /* no JSON body */ }
    const retryAfter = Number(res.headers.get('retry-after'));
    const label = PROVIDERS[provider].label;
    const text = hideKey(`${label} answered ${res.status}${code ? ` (${code})` : ''}: ${message || res.statusText || 'no details'}`, apiKey);
    const lower = `${code} ${message}`.toLowerCase();
    return new ProviderError(text.slice(0, 600), {
        status: res.status,
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 90000) : undefined,
        billing: res.status === 402 || /insufficient_quota|credit balance|billing|payment required|insufficient credits|arrearage|overdue/.test(lower),
        transient: res.status >= 500 || res.status === 529,
    });
};

const post = async (provider: ProviderId, url: string, headers: Record<string, string>, body: any, signal: AbortSignal, apiKey: string): Promise<any> => {
    // The key only ever goes to the provider's own address.
    if (!allowedUrl(provider, url)) throw new Error(`Refusing to send a ${provider} request to ${url}`);
    let res: Response;
    try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
    } catch (err: any) {
        if (err?.name === 'AbortError') throw err;
        // A browser reports a blocked or failed request only as "Failed to fetch". OpenAI, for example,
        // sends some error answers without the header that lets a browser read them.
        throw new ProviderError(
            `Could not get an answer from ${PROVIDERS[provider].label} (network problem, or the answer was not readable by the browser). ` +
            `If this keeps happening, use "Check key" in AI settings.`,
            { transient: true }
        );
    }
    // Requests-per-minute limit, when the provider lets the browser read it (see rateLimit.ts)
    learnFromHeaders(provider, apiKey, typeof body?.model === 'string' ? body.model : '', res.headers);
    if (!res.ok) throw await toProviderError(provider, res, apiKey);
    return res.json();
};

const pdfDataUrl = (pdf: { mimeType: string; data: string }) => `data:${pdf.mimeType || 'application/pdf'};base64,${pdf.data}`;

/** Some models put prose or code fences around the JSON; keep the JSON object itself. */
const jsonOnly = (text: string): string => {
    const t = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (t.startsWith('{') || t.startsWith('[')) return t;
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    return start >= 0 && end > start ? t.slice(start, end + 1) : t;
};

/**
 * A model can give shorter answers than the generator allows (MAX_OUTPUT_TOKENS). Such a request is
 * refused with a 400 that names the limit; it is then sent again with the model's own limit (or none).
 */
const isOutputLimitError = (err: any) =>
    err?.status === 400 && /max_tokens|max_completion_tokens|max_output_tokens|output tokens|maximum.*tokens|tokens.*maximum/i.test(err?.message || '');
const limitFromError = (err: any): number | undefined => {
    const m = String(err?.message || '').match(/(\d{3,7})\s*(?:,\s*)?(?:which is the maximum|is the maximum|maximum allowed)/i)
        || String(err?.message || '').match(/(?:at most|maximum(?: value)? (?:is|of)|supports at most|<=)\s*(\d{3,7})/i);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
};
const withOutputLimit = async <T>(limit: number | undefined, send: (limit: number | undefined) => Promise<T>): Promise<T> => {
    try {
        return await send(limit);
    } catch (err: any) {
        if (limit === undefined || !isOutputLimitError(err)) throw err;
        const lower = limitFromError(err);
        console.warn(`The model does not accept an answer limit of ${limit} tokens; sending again with ${lower ?? 'its own limit'}.`);
        return send(lower !== undefined && lower < limit ? lower : undefined);
    }
};

const shaped = (text: string, finishReason: string, usage: ReportedUsage, model: string): ProviderResponse => ({
    text,
    candidates: [{ finishReason }],
    usageMetadata: {
        promptTokenCount: usage.inputTokens,
        candidatesTokenCount: Math.max(0, usage.outputTokens - (usage.reasoningTokens || 0)),
        thoughtsTokenCount: usage.reasoningTokens,
        cachedContentTokenCount: usage.cachedTokens,
    },
    __model: model,
    __usage: usage,
});

// OpenAI-style finish reasons → the names llmService checks.
const openAiFinish = (r: string | undefined): string =>
    r === 'length' || r === 'model_length' ? 'MAX_TOKENS' : r === 'content_filter' ? 'SAFETY' : r === 'error' ? 'OTHER' : 'STOP';

const messageText = (message: any): string => {
    const c = message?.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map((p: any) => (typeof p === 'string' ? p : p?.text || '')).join('');
    return '';
};

const openAiStyleUsage = (u: any): ReportedUsage => ({
    inputTokens: Number(u?.prompt_tokens) || 0,
    outputTokens: Number(u?.completion_tokens) || 0,
    reasoningTokens: Number(u?.completion_tokens_details?.reasoning_tokens) || undefined,
    cachedTokens: Number(u?.prompt_tokens_details?.cached_tokens) || undefined,
    cacheWriteTokens: Number(u?.prompt_tokens_details?.cache_write_tokens ?? u?.cache_write_tokens) || undefined,
    providerCostUsd: typeof u?.cost === 'number' ? u.cost : undefined,
});

const callOpenAI = async (conn: LlmConnection, model: string, params: GenerateParams, signal: AbortSignal): Promise<ProviderResponse> => {
    const { system, pdf, text, jsonSchema } = splitParams(params);
    const headers = { Authorization: `Bearer ${conn.apiKey}` };
    // No answer limit is sent: OpenAI then allows the model's own maximum. A limit above a model's
    // maximum is refused with a 400, and OpenAI sends some error answers without the header a browser
    // needs to read them, so the generator could not react to that refusal.
    const build = (withSchema: boolean) => {
        const userText = withSchema || !jsonSchema ? text : `${text}\n\n${schemaInstruction(jsonSchema)}`;
        const content = pdf
            ? [{ type: 'file', file: { filename: 'certificate.pdf', file_data: pdfDataUrl(pdf) } }, { type: 'text', text: userText }]
            : userText;
        return {
            model,
            messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }],
            ...(jsonSchema
                ? { response_format: withSchema
                    ? { type: 'json_schema', json_schema: { name: 'response', schema: jsonSchema, strict: false } }
                    : { type: 'json_object' } }
                : {}),
        };
    };
    const send = (withSchema: boolean) => post('openai', 'https://api.openai.com/v1/chat/completions', headers, build(withSchema), signal, conn.apiKey);
    let data: any;
    try {
        data = await send(true);
    } catch (err: any) {
        // A model that does not accept this schema: ask for plain JSON with the schema in the text instead.
        if (jsonSchema && err?.status === 400 && /response_format|json_schema|schema/i.test(err.message)) {
            data = await send(false);
        } else throw err;
    }
    const choice = data?.choices?.[0];
    if (choice?.message?.refusal) throw new ProviderError(`OpenAI refused the request: ${choice.message.refusal}`);
    const raw = messageText(choice?.message);
    return shaped(jsonSchema ? jsonOnly(raw) : raw, openAiFinish(choice?.finish_reason), openAiStyleUsage(data?.usage), data?.model || model);
};

const callAnthropic = async (conn: LlmConnection, model: string, params: GenerateParams, signal: AbortSignal): Promise<ProviderResponse> => {
    const { system, pdf, text, jsonSchema, maxOutputTokens } = splitParams(params);
    // Anthropic's own JSON format has limits (24 optional fields) that the extraction schema exceeds,
    // so the schema goes into the request text instead.
    const userText = jsonSchema ? `${text}\n\n${schemaInstruction(jsonSchema)}` : text;
    const content: any[] = [];
    if (pdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.data } });
    content.push({ type: 'text', text: userText });
    // Anthropic needs an answer limit; use the model's own maximum when "Check key" reported it.
    const modelMax = (conn.available || []).find(m => m.id === model)?.maxOutput;
    const limit = Math.min(maxOutputTokens || 8192, modelMax || 64000);
    const headers = {
        'x-api-key': conn.apiKey,
        'anthropic-version': '2023-06-01',
        // Anthropic's documented switch for requests made straight from a web page with the user's own key.
        'anthropic-dangerous-direct-browser-access': 'true',
    };
    const data = await withOutputLimit(limit, l => post('anthropic', 'https://api.anthropic.com/v1/messages', headers, {
        model,
        // max_tokens is required by Anthropic: without a stated limit, fall back to 16384.
        max_tokens: l ?? 16384,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content }],
    }, signal, conn.apiKey));
    const raw = (Array.isArray(data?.content) ? data.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text || '').join('');
    const stop = data?.stop_reason;
    const finish = stop === 'max_tokens' ? 'MAX_TOKENS' : stop === 'refusal' ? 'SAFETY' : 'STOP';
    const u = data?.usage || {};
    const cacheRead = Number(u.cache_read_input_tokens) || 0;
    const cacheWrite = Number(u.cache_creation_input_tokens) || 0;
    const usage: ReportedUsage = {
        // Anthropic counts cached input separately; the total is what was read.
        inputTokens: (Number(u.input_tokens) || 0) + cacheRead + cacheWrite,
        outputTokens: Number(u.output_tokens) || 0,
        cachedTokens: cacheRead || undefined,
        cacheWriteTokens: cacheWrite || undefined,
    };
    return shaped(jsonSchema ? jsonOnly(raw) : raw, finish, usage, data?.model || model);
};

const callMistral = async (conn: LlmConnection, model: string, params: GenerateParams, signal: AbortSignal): Promise<ProviderResponse> => {
    const { system, pdf, text, jsonSchema, maxOutputTokens } = splitParams(params);
    const userText = jsonSchema ? `${text}\n\n${schemaInstruction(jsonSchema)}` : text;
    const content = pdf ? [{ type: 'document_url', document_url: pdfDataUrl(pdf) }, { type: 'text', text: userText }] : userText;
    const data = await withOutputLimit(maxOutputTokens ? Math.min(maxOutputTokens, 32768) : undefined, limit =>
        post('mistral', 'https://api.mistral.ai/v1/chat/completions', { Authorization: `Bearer ${conn.apiKey}` }, {
            model,
            messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }],
            ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
            ...(limit ? { max_tokens: limit } : {}),
        }, signal, conn.apiKey));
    const choice = data?.choices?.[0];
    const raw = messageText(choice?.message);
    return shaped(jsonSchema ? jsonOnly(raw) : raw, openAiFinish(choice?.finish_reason), openAiStyleUsage(data?.usage), data?.model || model);
};

const callOpenRouter = async (conn: LlmConnection, model: string, params: GenerateParams, signal: AbortSignal): Promise<ProviderResponse> => {
    const { system, pdf, text, jsonSchema, maxOutputTokens } = splitParams(params);
    const userText = jsonSchema ? `${text}\n\n${schemaInstruction(jsonSchema)}` : text;
    const content = pdf
        ? [{ type: 'file', file: { filename: 'certificate.pdf', file_data: pdfDataUrl(pdf) } }, { type: 'text', text: userText }]
        : userText;
    // OpenRouter only routes to providers that allow the requested answer length, so stay within the
    // model's limit (for "Automatic", within the smallest limit of the three models: 64000).
    const chosen = (conn.available || []).find(m => m.id === model);
    const outLimit = Math.min(maxOutputTokens || 0, model === AUTO ? 64000 : chosen?.maxOutput || 65536);
    const data = await withOutputLimit(outLimit > 0 ? outLimit : undefined, limit =>
        post('openrouter', 'https://openrouter.ai/api/v1/chat/completions', { Authorization: `Bearer ${conn.apiKey}` }, {
            ...(model === AUTO ? { models: PROVIDERS.openrouter.autoChain } : { model }),
            messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }],
            ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
            ...(limit ? { max_tokens: limit } : {}),
            // Only providers that do not collect the data, as stated in OpenRouter's provider settings.
            provider: { data_collection: 'deny' },
        }, signal, conn.apiKey));
    if (data?.error) throw new ProviderError(`OpenRouter: ${data.error.message || 'the model returned an error'}`, { transient: true });
    const choice = data?.choices?.[0];
    const raw = messageText(choice?.message);
    return shaped(jsonSchema ? jsonOnly(raw) : raw, openAiFinish(choice?.finish_reason), openAiStyleUsage(data?.usage), data?.model || model);
};

const callQwen = async (conn: LlmConnection, model: string, params: GenerateParams, signal: AbortSignal): Promise<ProviderResponse> => {
    const { system, pdf, text, jsonSchema } = splitParams(params);
    const blocks = [text];
    let images: string[] = [];
    if (pdf) {
        // Qwen reads images only: the pages as images, plus the PDF's own text (see pdfPages.ts).
        const pages = await pdfToPages(pdf.data);
        images = pages.images;
        if (pages.text) {
            blocks.push('Text layer of the PDF, page by page, as read by the PDF reader. The page images above are the document; ' +
                'use this text to read small print exactly:\n' + pages.text);
        }
        if (pages.textOnlyPages.length > 0) {
            console.warn(`PDF too large to send every page as an image: pages ${pages.textOnlyPages.join(', ')} go to Qwen as text only.`);
        }
    }
    // Qwen's JSON mode needs the word "JSON" in the request; the schema block has it.
    if (jsonSchema) blocks.push(schemaInstruction(jsonSchema));
    const userText = blocks.join('\n\n');
    const content = images.length > 0
        ? [...images.map(url => ({ type: 'image_url', image_url: { url } })), { type: 'text', text: userText }]
        : userText;
    // No answer limit is sent: the model's own maximum applies (as for OpenAI).
    const url = `${originFor('qwen', conn.region)}/compatible-mode/v1/chat/completions`;
    const data = await post('qwen', url, { Authorization: `Bearer ${conn.apiKey}` }, {
        model,
        messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }],
        ...(jsonSchema ? { response_format: { type: 'json_object' } } : {}),
    }, signal, conn.apiKey);
    const choice = data?.choices?.[0];
    const raw = messageText(choice?.message);
    return shaped(jsonSchema ? jsonOnly(raw) : raw, openAiFinish(choice?.finish_reason), openAiStyleUsage(data?.usage), data?.model || model);
};

/** One request to a non-Gemini provider (Gemini goes through Google's own SDK in llmService). */
export const callProvider = (conn: LlmConnection, model: string, params: GenerateParams, signal: AbortSignal): Promise<ProviderResponse> => {
    switch (conn.provider) {
        case 'openai': return callOpenAI(conn, model, params, signal);
        case 'anthropic': return callAnthropic(conn, model, params, signal);
        case 'mistral': return callMistral(conn, model, params, signal);
        case 'qwen': return callQwen(conn, model, params, signal);
        case 'openrouter': return callOpenRouter(conn, model, params, signal);
        default: throw new Error(`No request format for ${conn.provider}`);
    }
};

/** Gemini SDK usage numbers → the common form. Gemini bills thinking tokens as output. */
export const geminiUsage = (u: any): ReportedUsage => ({
    inputTokens: Number(u?.promptTokenCount) || 0,
    outputTokens: (Number(u?.candidatesTokenCount) || 0) + (Number(u?.thoughtsTokenCount) || 0),
    reasoningTokens: Number(u?.thoughtsTokenCount) || undefined,
    cachedTokens: Number(u?.cachedContentTokenCount) || undefined,
});

// ─────────────────────────────── Check key / list models ───────────────────────────────

const getJson = async (provider: ProviderId, url: string, headers: Record<string, string>): Promise<any> => {
    if (!allowedUrl(provider, url)) throw new Error(`Refusing to send a ${provider} request to ${url}`);
    let res: Response;
    try {
        res = await fetch(url, { headers });
    } catch {
        throw new Error(`${PROVIDERS[provider].label} could not be reached from this browser. Check the network connection, VPN or firewall.`);
    }
    if (res.status === 401 || res.status === 403 || (provider === 'gemini' && res.status === 400)) {
        throw new Error(`${PROVIDERS[provider].label} did not accept this key. Check that it was copied completely.`);
    }
    if (!res.ok) throw await toProviderError(provider, res, headers.Authorization?.replace(/^Bearer /, '') || headers['x-api-key'] || headers['x-goog-api-key'] || '');
    return res.json();
};

const byPreference = (provider: ProviderId) => (a: ModelOption, b: ModelOption) => {
    const chain = PROVIDERS[provider].autoChain;
    const ia = chain.indexOf(a.id), ib = chain.indexOf(b.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return b.id.localeCompare(a.id, undefined, { numeric: true });
};

// Gemini models that do not write text from a PDF (speech, images, video, live audio, embeddings).
const GEMINI_NOT_FOR_DOCUMENTS = /(tts|image|imagen|veo|live|embedding|aqa|audio|transcribe|robotics|computer-use|translate|banana|omni|learnlm|gemma)/i;
// Qwen models that read images: Qwen3.5 and later are multimodal, plus the Qwen-VL lines. Excluded:
// OCR-only, speech and real-time models, coders, translation, image generation, embeddings.
const QWEN_DOCUMENT_MODELS = /^(qwen3\.\d+-[a-z0-9.-]+|qwen3-vl-[a-z0-9.-]+|qwen-vl-(max|plus)[a-z0-9.-]*)$/i;
const QWEN_NOT_FOR_DOCUMENTS = /(ocr|omni|realtime|tts|asr|-mt|coder|image|embed|translate|deep-research|character)/i;
// OpenAI models for other jobs (speech, images, search, coding agents, special programmes).
const OPENAI_NOT_FOR_DOCUMENTS = /(audio|realtime|transcribe|tts|image|search|codex|instruct|embedding|moderation|dall-e|whisper|chat-latest|cyber|rosalind|live|computer-use|oss|deep-research)/i;

/**
 * Checks the key with the provider and lists the models that can read the certificates.
 * Throws an Error with a sentence for the user when the key does not work.
 */
export const listModels = async (provider: ProviderId, apiKey: string, region?: string): Promise<ModelOption[]> => {
    const key = apiKey.trim();
    if (!key) throw new Error('Enter the key first.');
    let models: ModelOption[] = [];
    if (provider === 'gemini') {
        const data = await getJson('gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': key });
        models = (data?.models || [])
            .filter((m: any) => (m?.supportedGenerationMethods || []).includes('generateContent'))
            .map((m: any) => String(m.name || '').replace(/^models\//, ''))
            .filter((id: string) => /^gemini-/.test(id) && !GEMINI_NOT_FOR_DOCUMENTS.test(id))
            .map((id: string) => ({ id, label: id }));
    } else if (provider === 'openai') {
        const data = await getJson('openai', 'https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
        models = (data?.data || [])
            .map((m: any) => String(m?.id || ''))
            .filter((id: string) => /^gpt-(4o|4\.1|5|6)/.test(id) && !OPENAI_NOT_FOR_DOCUMENTS.test(id))
            .map((id: string) => ({ id, label: id }));
    } else if (provider === 'anthropic') {
        const data = await getJson('anthropic', 'https://api.anthropic.com/v1/models?limit=1000', {
            'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
        });
        models = (data?.data || [])
            .filter((m: any) => /^claude-/.test(String(m?.id || '')))
            .map((m: any) => ({ id: String(m.id), label: m.display_name ? `${m.display_name} (${m.id})` : String(m.id), maxOutput: Number(m.max_tokens) || undefined }));
    } else if (provider === 'mistral') {
        const data = await getJson('mistral', 'https://api.mistral.ai/v1/models', { Authorization: `Bearer ${key}` });
        const ids = new Set<string>();
        for (const m of data?.data || []) {
            if (!m?.capabilities?.vision || !m?.capabilities?.completion_chat || m?.archived || m?.deprecation) continue;
            if (m.id) ids.add(String(m.id));
            for (const a of m.aliases || []) if (/-latest$/.test(String(a))) ids.add(String(a));
        }
        models = Array.from(ids).map(id => ({ id, label: id }));
    } else if (provider === 'qwen') {
        const data = await getJson('qwen', `${originFor('qwen', region)}/compatible-mode/v1/models`, { Authorization: `Bearer ${key}` });
        models = (data?.data || [])
            .map((m: any) => String(m?.id || ''))
            .filter((id: string) => QWEN_DOCUMENT_MODELS.test(id) && !QWEN_NOT_FOR_DOCUMENTS.test(id))
            .map((id: string) => ({ id, label: id }));
    } else if (provider === 'openrouter') {
        // The key check answers with the key's credit; the model list is public.
        await getJson('openrouter', 'https://openrouter.ai/api/v1/key', { Authorization: `Bearer ${key}` });
        const data = await getJson('openrouter', 'https://openrouter.ai/api/v1/models', {});
        models = (data?.data || [])
            .filter((m: any) => {
                const input: string[] = m?.architecture?.input_modalities || [];
                const output: string[] = m?.architecture?.output_modalities || ['text'];
                return (input.includes('file') || input.includes('image')) && output.includes('text') && !/:(free|batch)$/.test(String(m?.id || ''));
            })
            .map((m: any) => {
                const input: string[] = m.architecture.input_modalities || [];
                const ocr = !input.includes('file');
                const perM = (v: any) => Number.isFinite(Number(v)) ? `$${(Number(v) * 1e6).toFixed(2)}` : '?';
                return {
                    id: String(m.id),
                    label: `${m.id} · ${perM(m?.pricing?.prompt)} / ${perM(m?.pricing?.completion)} per 1M tokens${ocr ? ' · PDF converted by OCR (extra fee)' : ''}`,
                    ocr,
                    maxOutput: Number(m?.top_provider?.max_completion_tokens) || undefined,
                };
            });
    }
    return models.sort(byPreference(provider));
};
