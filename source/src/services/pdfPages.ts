// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Page images and page text of a PDF, for models that read images but not PDF files (Qwen).
 *
 * Gemini, OpenAI, Anthropic and Mistral receive the PDF itself and read both its text and its page
 * images. Alibaba Cloud's Qwen models accept images only, so each page is drawn here with the same
 * pdf.js that shows the certificate, and the text layer of the PDF is added as well. Nothing leaves the
 * browser in this step.
 */

export interface PdfPages {
    /** One JPEG data URL per page, for pages 1, 2, 3, … */
    images: string[];
    /** The PDF's text layer, page by page. Empty for scanned PDFs without text. */
    text: string;
    pages: number;
    /** The last pages, sent as text only because their images would exceed the request size limit. */
    textOnlyPages: number[];
}

import { openPdf, pdfjsAvailable, closePdf } from '../utils/pdfjs';

// Qwen's default image size: 2,621,440 pixels = 2,560 visual tokens of 32 x 32 pixels. A larger image
// is scaled down by the model anyway (Alibaba Cloud, "Image limitations"), so nothing is gained by it.
// For an A4 page this is about 165 dpi, enough for small print in tables.
const PIXEL_BUDGET = 2_621_440;
// Alibaba Cloud's DashScope addresses accept requests of up to 16 MiB; stay well below with the images.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

const decodeBase64 = (base64: string): Uint8Array => {
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
};

const pageText = (items: any[]): string => {
    let s = '';
    for (const it of items) {
        if (typeof it?.str !== 'string') continue;
        s += it.str;
        s += it.hasEOL ? '\n' : (it.str && !/\s$/.test(it.str) ? ' ' : '');
    }
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

/**
 * The text layer of a PDF (first pages only), read in the browser. Used to check what the model wrote
 * against the certificate, e.g. the country of an address. Empty when the PDF has no text or cannot
 * be read; never throws.
 */
export const pdfPlainText = async (base64: string, maxPages = 40): Promise<string> => {
    if (!pdfjsAvailable() || !base64) return '';
    let pdf: any = null;
    try {
        pdf = await openPdf({ data: decodeBase64(base64) }).promise;
        const texts: string[] = [];
        for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
            const page = await pdf.getPage(i);
            try { texts.push(pageText((await page.getTextContent()).items)); } finally { page.cleanup(); }
        }
        return texts.join('\n\n');
    } catch {
        return '';
    } finally {
        if (pdf) closePdf(pdf);
    }
};

// The same PDF is converted once, even when the request is repeated (retries, next model).
let cache: { key: string; result: Promise<PdfPages> } | null = null;

export const pdfToPages = (base64: string): Promise<PdfPages> => {
    if (cache && cache.key === base64) return cache.result;
    const result = convert(base64);
    cache = { key: base64, result };
    result.catch(() => { if (cache?.result === result) cache = null; });
    return result;
};

const convert = async (base64: string): Promise<PdfPages> => {
    if (!pdfjsAvailable()) throw new Error('The PDF reader of the generator is not available, so the pages could not be prepared for Qwen.');
    // Same settings as the viewer (utils/pdfjs.ts): no scripts, no XFA, nothing downloaded.
    const pdf = await openPdf({ data: decodeBase64(base64) }).promise;
    try {
        const images: string[] = [];
        const texts: string[] = [];
        const textOnlyPages: number[] = [];
        let bytes = 0;
        for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n);
            try {
                texts.push(pageText((await page.getTextContent()).items));
                // Once the size limit is reached, the remaining pages go as text only, so the images
                // always are pages 1, 2, 3, … in order.
                if (textOnlyPages.length > 0) { textOnlyPages.push(n); continue; }
                const base = page.getViewport({ scale: 1 });
                const scale = Math.min(4, Math.sqrt(PIXEL_BUDGET / (base.width * base.height)));
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(11, Math.floor(viewport.width));
                canvas.height = Math.max(11, Math.floor(viewport.height));
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('No canvas available to draw the PDF pages.');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport }).promise;
                const url = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
                canvas.width = canvas.height = 0; // free the memory at once
                if (bytes + url.length > MAX_IMAGE_BYTES) {
                    textOnlyPages.push(n);
                } else {
                    images.push(url);
                    bytes += url.length;
                }
            } finally {
                page.cleanup();
            }
        }
        const text = texts.some(t => t) ? texts.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n') : '';
        return { images, text, pages: pdf.numPages, textOnlyPages };
    } finally {
        closePdf(pdf);
    }
};
