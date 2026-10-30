// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/**
 * Opening PDFs with the pdf.js built into the page (pdf.js 6, see vendor/pdfjs6/SOURCE.md).
 *
 * pdf.js decodes two kinds of images in WebAssembly: JBIG2 and CCITT (typical of scanned pages) and
 * JPEG 2000. It normally downloads the decoders from a web address. Here they are embedded in the
 * page, and this class hands them to pdf.js instead, so nothing is downloaded and the generator also
 * works offline and from a file. Character maps and standard font data are not embedded (as before).
 */
const EMBEDDED: Record<string, string> = {
    'jbig2.wasm': 'pdf-wasm-jbig2',
    'openjpeg.wasm': 'pdf-wasm-openjpeg',
};
const decoded = new Map<string, Uint8Array>();

const embeddedBytes = (filename: string): Uint8Array => {
    let bytes = decoded.get(filename);
    if (!bytes) {
        const el = EMBEDDED[filename] ? document.getElementById(EMBEDDED[filename]) : null;
        const b64 = (el?.textContent || '').trim();
        if (!b64) throw new Error(`${filename} is not embedded in this page.`);
        const bin = atob(b64);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        decoded.set(filename, bytes);
    }
    // pdf.js may hand the buffer over to its worker, which empties it here: always give a copy.
    return bytes.slice();
};

/** Given to pdf.js as BinaryDataFactory: answers its requests for decoder files from the page. */
class EmbeddedBinaryData {
    constructor(_options: unknown) { /* nothing to set up */ }
    async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
        if (kind === 'wasmUrl') return embeddedBytes(filename);
        throw new Error(`No ${kind === 'cMapUrl' ? 'character map' : 'standard font'} data built in: ${filename}`);
    }
}

export const pdfjsAvailable = (): boolean => !!(window as any).pdfjsLib;

/**
 * One worker for every PDF the page opens. pdf.js itself would start a module worker, which a page
 * opened from disk is not allowed to load from a blob: address; it would then read the PDFs on the
 * page's own thread instead (slower, and the page stalls on big certificates). So the page starts
 * the worker as a classic script (see build.mjs), waits for its "ready" message and hands it to
 * pdf.js. Passed as `worker`, it stays open when a document is closed. If it does not start, pdf.js
 * falls back to its own way.
 */
let sharedWorker: Promise<any> | null = null;

/**
 * Fallback when no worker can be started (e.g. workers blocked by a browser policy): the worker code
 * is loaded into the page itself, where it registers as globalThis.pdfjsWorker, and pdf.js then reads
 * the PDFs on the page's own thread. Slower, but the certificates are still shown.
 */
const onPageThread = async (lib: any): Promise<void> => {
    if ((globalThis as any).pdfjsWorker?.WorkerMessageHandler) return;
    const src = lib.GlobalWorkerOptions?.workerSrc;
    if (!src) return;
    try { await import(/* @vite-ignore */ src); } catch { /* pdf.js reports it when it opens the PDF */ }
};
const WORKER_START_MS = 15000;

const readyWorker = (lib: any): Promise<any> => {
    if (sharedWorker) return sharedWorker;
    sharedWorker = new Promise<any>((resolve) => {
        const src = lib.GlobalWorkerOptions?.workerSrc;
        if (!src || typeof Worker === 'undefined' || typeof lib.PDFWorker !== 'function') { void onPageThread(lib).then(() => resolve(null)); return; }
        let worker: Worker;
        try { worker = new Worker(src); } catch { void onPageThread(lib).then(() => resolve(null)); return; }
        let settled = false;
        const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            if (!ok) { worker.terminate(); void onPageThread(lib).then(() => resolve(null)); return; }
            try { resolve(new lib.PDFWorker({ port: worker })); } catch { worker.terminate(); void onPageThread(lib).then(() => resolve(null)); }
        };
        const onMessage = (e: MessageEvent) => { if (e.data && e.data.action === 'ready') finish(true); };
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), WORKER_START_MS);
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
    });
    return sharedWorker;
};

/**
 * pdf.js getDocument with the generator's settings: no scripts from the PDF, no XFA forms, the
 * embedded decoders, and nothing fetched from the network except the PDF itself (a blob: address).
 * Returns { promise } like pdf.js's loading task; close the document with closePdf().
 */
export const openPdf = (source: { url: string } | { data: Uint8Array }, opts?: { cancelled?: () => boolean }): { promise: Promise<any> } => {
    const lib = (window as any).pdfjsLib;
    if (!lib) throw new Error('The PDF reader of the generator is not available.');
    const promise = readyWorker(lib).then((worker) => {
      // Given up while the worker started (another PDF was chosen): the PDF is not read at all.
      if (opts?.cancelled?.()) throw Object.assign(new Error('Opening the PDF was cancelled.'), { name: 'AbortError' });
      return lib.getDocument({
        ...source,
        ...(worker && !worker.destroyed ? { worker } : {}),
        BinaryDataFactory: EmbeddedBinaryData,
        useWorkerFetch: false,
        wasmUrl: 'embedded/',
        enableXfa: false,
        // Ignored by pdf.js 6, which no longer has code that turns PDF data into JavaScript; kept so
        // that an older pdf.js would still never do it.
        isEvalSupported: false,
      }).promise;
    });
    return { promise };
};

/**
 * Closes a document and ends its worker. pdf.js 6 does this through the loading task (the document's
 * own destroy() was removed); older versions had both.
 */
export const closePdf = (pdf: any): void => {
    try {
        const task = pdf?.loadingTask;
        if (task && typeof task.destroy === 'function') void task.destroy();
        else if (pdf && typeof pdf.destroy === 'function') void pdf.destroy();
    } catch { /* already closed */ }
};

/** True once closePdf() has closed the document: work still running on it is then abandoned. */
export const isClosedDoc = (pdf: any): boolean => !!pdf?.loadingTask?.destroyed;
