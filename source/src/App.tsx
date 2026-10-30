// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

import React, { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import { 
    DRMD, INITIAL_PRODUCER, INITIAL_PERSON, INITIAL_ID, INITIAL_QUANTITY, ALLOWED_TITLES, BulkResult, Identifier, Quantity, MeasurementResult, MaterialProperty,
    BinaryDocument, rmDocumentName, isPdfDocument
} from './types';
import { extractStructuredDataFromPdf, clearQuotaMemory, ExtractionReport } from './services/llmService';
import { mapExtractedToDrmd, resolveIdentifiers, applyIdentifierPatch, createInitialDrmd, generateUUID, lookUpRorAgain, lookUpChemicalAgain, lookUpChemicalsAgain, materialLookupContext, chemKey, refineUnitsWithAi, applyUnitPatch, needsUnitAi, unitContextTexts } from './services/extractionPipeline';
import { generateDrmdXml } from './utils/xmlGenerator';
import { convertToDSI, getDsiPreview, dsiFor } from './utils/unitConverter';
import { checkDsi, explainDsi, verifySameUnit, parseHumanUnit, isKindDependent, issuesText, guidePageUrl, DsiClass, DSI_CLASS_LABEL, DSI_CLASS_MEANING, DSI_CLASS_PAGE } from './utils/dsi';
import { parseDrmdXml } from './utils/xmlParser';
import { validateDrmd } from './utils/validator';
import { docsUrlFor, DOCS_PATHS, VIDEO_GUIDE_URL } from './utils/docsLinks';
import { safeHttpUrl } from './utils/safeUrl';
import { toXsdDate, toUncertaintyString, toCoverageFactor, toCoverageProbability } from './utils/xmlValues';
import { Icon, Spinner, formatElapsed } from './components/ui';
import { PROVIDERS, PROVIDER_IDS, ProviderId, LlmConnection, ModelOption, AUTO, listModels } from './services/providers';
import { subscribeUsage, usageSnapshot, clearUsage } from './services/usage';
import { rpmSnapshot, subscribeRpm, RpmRow } from './services/rateLimit';
import { PRICES_CHECKED } from './services/pricing';
import { openPdf, closePdf, isClosedDoc } from './utils/pdfjs';
import { pdfPlainText } from './services/pdfPages';
import { isIsoDate, dateForms, countryForms, addressForms, conversionReason, SourceKind } from './utils/sourceForms';



// Helper for HTML Report Generation
/** Escapes text for HTML. */
const esc = (v: unknown): string => (v === undefined || v === null ? '' : String(v))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const generateHtmlReport = (data: DRMD) => {
    const styles = `
        body { font-family: "IBM Plex Sans", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; color: #1c2630; margin: 0 auto; padding: 40px 48px; max-width: 1100px; line-height: 1.5; font-size: 14px; font-variant-numeric: tabular-nums; }
        h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; border-bottom: 2px solid #1c2630; padding-bottom: 14px; margin: 0 0 28px; }
        h2 { font-size: 17px; font-weight: 600; margin: 36px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #c2c9d0; color: #1c2630; }
        h3 { font-size: 15px; font-weight: 600; margin: 22px 0 10px; color: #3c4955; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 13px; }
        th { text-align: left; padding: 7px 10px; color: #5f6b77; font-weight: 500; width: 22%; vertical-align: top; border-bottom: 1px solid #e9ecef; }
        td { padding: 7px 10px; color: #1c2630; vertical-align: top; border-bottom: 1px solid #e9ecef; }
        tr.group th { background: #f2f4f6; color: #1c2630; font-weight: 600; padding-top: 10px; }
        a { color: #1d6276; }
        .footer { margin-top: 56px; font-size: 12px; color: #8b96a1; border-top: 1px solid #d9dee3; padding-top: 14px; }
        .tag { display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 11px; font-weight: 500; border: 1px solid; }
        .tag-green { background: #e9f4ed; color: #2c7349; border-color: #b9dcc5; }
        .tag-yellow { background: #f7f8f9; color: #5f6b77; border-color: #d9dee3; }
        .mono { font-family: "IBM Plex Mono", Consolas, monospace; }
        @media print { body { padding: 0; } h2 { break-after: avoid; } table { break-inside: auto; } tr { break-inside: avoid; } }
    `;

    // Every value comes from a certificate, an AI answer or an imported XML file, so it is escaped:
    // text such as "<img onerror=…>" must show as text and never run as code (the report is shown
    // inside the generator, where the API key is in use).
    const renderRow = (label: string, value: any) => {
        if (value === undefined || value === null || value === "") return '';
        return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
    };
    /** Only for values built here from already escaped parts. */
    const renderRowHtml = (label: string, html: string) => html ? `<tr><th>${esc(label)}</th><td>${html}</td></tr>` : '';

    let adminRows = '';
    adminRows += renderRow('Title', data.administrativeData.title);
    adminRows += renderRow('Unique Identifier', data.administrativeData.uniqueIdentifier);
    adminRows += renderRow('Validity Type', data.administrativeData.validityType);
    if (data.administrativeData.validityType === 'Specific Time') {
        adminRows += renderRow('Valid Until', data.administrativeData.specificTime);
    } else if (data.administrativeData.validityType === 'Time After Dispatch') {
         adminRows += renderRow('Duration', `${data.administrativeData.durationY} Years ${data.administrativeData.durationM} Months`);
         adminRows += renderRow('Dispatch Date', data.administrativeData.dateOfIssue);
    }

    const producerRows = data.administrativeData.producers.map((p, i) => {
        let rows = `<tr class="group"><th colspan="2">Producer${data.administrativeData.producers.length > 1 ? ` ${i+1}` : ''}</th></tr>`;
        rows += renderRow('Name', p.name);
        rows += renderRow('Email', p.email);
        rows += renderRow('Phone', p.phone);
        rows += renderRow('Fax', p.fax);
        const address = `${p.address.street} ${p.address.streetNo}, ${p.address.postCode} ${p.address.city}, ${p.address.countryCode}`.trim();
        rows += renderRow('Address', address.replace(/ ,/g, ''));
        const rorIds = (p.organizationIdentifiers || []).filter(id => id.scheme === 'ROR' && id.value);
        if (rorIds.length > 0) {
            rows += renderRowHtml('ROR ID', rorIds.map(id => `<a href="https://ror.org/${encodeURIComponent(id.value.trim())}" target="_blank" rel="noopener noreferrer">${esc(id.value)}</a>`).join(', '));
        }
        return rows;
    }).join('');

    const personRows = data.administrativeData.responsiblePersons.map((p, i) => {
        let rows = `<tr class="group"><th colspan="2">Responsible person ${i+1}</th></tr>`;
        rows += renderRowHtml('Name', `${esc(p.name)} ${p.mainSigner ? '<span class="tag tag-green">Main Signer</span>' : ''}`);
        rows += renderRow('Role', p.role);
        rows += renderRow('Description', p.description);
        return rows;
    }).join('');

    const materialHtml = data.materials.map((m, i) => `
        <h3>Material ${i+1}: ${esc(m.name)}</h3>
        <table>
            ${renderRow('Description', m.description)}
            ${renderRow('Material Class', m.materialClass)}
            ${renderRow('Min Sample Size', m.minimumSampleSize)}
            ${renderRow('Item Quantities', m.itemQuantities)}
            ${renderRow('Identifiers', m.materialIdentifiers.map(id => id.value).filter(Boolean).join(', '))}
        </table>
    `).join('');

    const propertiesHtml = data.properties.map(p => `
        <div style="margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #d9dee3; padding-bottom: 8px; margin-bottom: 12px;">
                <span style="font-weight: 600; font-size: 15px; color: #1c2630;">${esc(p.name)}</span>
                <span class="tag ${p.isCertified ? 'tag-green' : 'tag-yellow'}">${p.isCertified ? 'Certified' : 'Not Certified'}</span>
            </div>
            ${p.description ? `<p style="font-size: 13px; color: #5f6b77; margin-bottom: 15px; font-style: italic;">${esc(p.description)}</p>` : ''}
            ${p.procedures ? `<p style="font-size: 13px; color: #5f6b77; margin-bottom: 15px;"><strong>Procedures:</strong> ${esc(p.procedures)}</p>` : ''}
            
            ${p.results.map(r => `
                <div style="margin-left: 0px; margin-bottom: 20px;">
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #3c4955;">${esc(r.name)}</div>
                    ${r.description ? `<div style="font-size: 12px; color: #5f6b77; margin-bottom: 8px; font-style: italic;">${esc(r.description)}</div>` : ''}
                    <div style="overflow-x: auto;">
                        <table style="min-width: 900px;">
                            <tr style="background: #f7f8f9;">
                                <th style="width: 20%; padding: 8px;">Name</th>
                                <th style="width: 15%; padding: 8px;">Value</th>
                                <th style="width: 10%; padding: 8px;">Unit</th>
                                <th style="width: 10%; padding: 8px;">DSI Unit</th>
                                <th style="width: 10%; padding: 8px;">Uncertainty</th>
                                <th style="width: 8%; padding: 8px;">k</th>
                                <th style="width: 8%; padding: 8px;">Prob.</th>
                                <th style="width: 15%; padding: 8px;">Identifiers</th>
                            </tr>
                            ${r.quantities.map((q: any) => {
                                const identifiersStr = (q.identifiers || [])
                                    .filter((id: any) => id.scheme && id.value && id.value.trim() !== '')
                                    .map((id: any) => `<b>${esc(id.scheme)}:</b> ${esc(id.value)}`)
                                    .join('<br/>');
                                return `
                                <tr>
                                    <td style="padding: 8px;">${esc(q.name)}</td>
                                    <td style="padding: 8px;">${esc(q.value)}</td>
                                    <td style="padding: 8px;">${esc(q.unit)}</td>
                                    <td class="mono" style="padding: 8px; color: #3c4955;">${esc(q.dsiUnit)}</td>
                                    <td style="padding: 8px;">${esc(q.uncertainty)}</td>
                                    <td style="padding: 8px;">${esc(q.coverageFactor)}</td>
                                    <td style="padding: 8px;">${esc(q.coverageProbability)}</td>
                                    <td style="padding: 8px; font-size: 11px;">${identifiersStr || ''}</td>
                                </tr>
                                `;
                            }).join('')}
                        </table>
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');

    const stmt = data.statements.official;
    let stmtRows = '';
    stmtRows += renderRow('Intended Use', stmt.intendedUse);
    stmtRows += renderRow('Storage Information', stmt.storageInformation);
    stmtRows += renderRow('Handling Instructions', stmt.handlingInstructions);
    stmtRows += renderRow('Metrological Traceability', stmt.metrologicalTraceability);
    stmtRows += renderRow('Health & Safety', stmt.healthAndSafety);
    stmtRows += renderRow('Subcontractors', stmt.subcontractors);
    stmtRows += renderRow('Legal Notice', stmt.legalNotice);
    stmtRows += renderRow('Ref to Certification Report', stmt.referenceToCertificationReport);

    const customStmtRows = data.statements.custom.map(s => renderRow(s.name, s.content)).join('');

    const commentHtml = data.generalComment || (data.binaryDocuments && data.binaryDocuments.length > 0) ? `
        <h2>Comment and Document</h2>
        <table>
            ${renderRow('General Comment', data.generalComment)}
            ${renderRow('Attached Documents', data.binaryDocuments && data.binaryDocuments.length > 0 ? data.binaryDocuments.map(d => d.fileName).join(', ') : 'None')}
        </table>
    ` : '';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
        <title>${esc(data.administrativeData.title)}</title>
        <style>${styles}</style>
    </head>
    <body>
        <h1>${esc(data.administrativeData.title)}</h1>
        
        <h2>Administrative Data</h2>
        <table>
            ${adminRows}
            ${producerRows}
            ${personRows}
        </table>

        <h2>Materials</h2>
        ${materialHtml || '<p style="color:#6b7280; font-style:italic;">No materials defined.</p>'}

        <h2>Properties</h2>
        ${propertiesHtml || '<p style="color:#6b7280; font-style:italic;">No properties defined.</p>'}

        <h2>Statements</h2>
        <table>
            ${stmtRows}
            ${customStmtRows}
        </table>

        ${commentHtml}

        <div class="footer">
            Generated with the DRMD AI Generator ${__APP_VERSION__} on ${new Date().toISOString().slice(0, 10)}. Unique identifier: <span class="mono">${esc(data.administrativeData.uniqueIdentifier) || '–'}</span>
        </div>
    </body>
    </html>
    `;
};

// --- Custom PDF Viewer Component ---
interface HighlightData {
    type: 'text' | 'coords';
    value: string | number[];
    /** Other forms the value can have in the PDF, tried when it is not there word for word. */
    alternatives?: string[];
}

const CONVERTED_VALUE_PREFIX = "Converted for the XML";
const GENERATED_VALUE_MESSAGE = "This value does not appear in the PDF. It was derived or added by the model, so please verify it.";
const DERIVED_FROM_TEXT_MESSAGE = "Not word for word in the PDF. The marked text is what this value was derived from; please verify it.";
const DERIVED_FROM_AREA_MESSAGE = "Not word for word in the PDF. The marked area is where this value was derived from; please verify it.";
// The same search for a document entered by hand or opened from an XML file: nothing was derived by a model.
const NOT_FOUND_MESSAGE = "This value was not found word for word in the PDF text.";
const PARTLY_FOUND_MESSAGE = "Not word for word in the PDF. The marked text is the closest match.";

// --- Reading the text of a PDF page ---
// Many certificates position each digit separately (tabular figures), so pdf.js returns "4.7" as
// the two pieces "4." and "7", and "0.05" as "0", "." and "05". Joining every piece with a space
// turned "4.7" into "4. 7", which no word-for-word search could find. Pieces on the same line that
// touch each other (gap well below a space) belong to one word and are joined without a space.
// Measured on BAM, JRC, AIST and ERM certificates: touching pieces are at most 0.03 font heights
// apart, word gaps at least 0.17 (and are usually marked by an explicit space anyway).
const JOIN_GAP = 0.1;
export interface PdfWord { text: string; items: any[] }
const pdfWords = (items: any[]): PdfWord[] => {
    const words: PdfWord[] = [];
    let cur: PdfWord | null = null;
    let prev: any = null;
    let breakBefore = true;
    for (const it of items) {
        const str: string = it?.str ?? '';
        if (!str.trim()) { breakBefore = true; if (it?.hasEOL) prev = null; continue; }
        let join = false;
        if (cur && prev && !breakBefore && !/^\s/.test(str) && !/\s$/.test(prev.str || '')) {
            const h = Math.hypot(it.transform?.[2] || 0, it.transform?.[3] || 0) || it.height || 10;
            const sameLine = Math.abs((it.transform?.[5] ?? 0) - (prev.transform?.[5] ?? 0)) < 0.5 * h;
            const gap = ((it.transform?.[4] ?? 0) - ((prev.transform?.[4] ?? 0) + (prev.width || 0))) / h;
            join = sameLine && gap > -0.2 && gap < JOIN_GAP;
        }
        // An item can hold several words ("Unweighted mean value of"): only its first word can
        // continue the previous piece, and only its last word can be continued by the next.
        const parts = str.split(/\s+/).filter(Boolean);
        parts.forEach((part, k) => {
            if (k === 0 && join && cur) { cur.text += part; cur.items.push(it); }
            else { cur = { text: part, items: [it] }; words.push(cur); }
        });
        prev = it;
        breakBefore = /\s$/.test(str) || !!it.hasEOL;
    }
    return words;
};

// Sub-component: renders exactly ONE PDF page at the size the viewer gives it (the page fitted into
// the pane, times the zoom). PDF.js handles page rotation natively, so no manual mirror/flip
// heuristics are used (those were the cause of the occasional reversed pages/text).
//
// Sharpness: the canvas is drawn with at least 2 device pixels per CSS pixel, also on screens that
// have only 1 (most office monitors at 100 % scaling). The browser then scales the page down, which
// keeps small print in tables readable; drawn 1:1 it looked coarse. A cap on the canvas size keeps
// memory use in bounds when zoomed in. Only pages near the visible part are drawn.
const MAX_CANVAS_PIXELS = 12_000_000;
const PdfPage: React.FC<{
    pdfDoc: any;
    pageNum: number;
    rotation: number;
    /** PDF.js scale for this page (fit into the pane × zoom) and the resulting CSS size. */
    scale: number;
    cssW: number;
    cssH: number;
    /** Size of the page's slot: at least the visible pane. */
    slotW: number;
    slotH: number;
    highlightData?: HighlightData | null;
    targetPage?: number | null;
}> = ({ pdfDoc, pageNum, rotation, scale, cssW, cssH, slotW, slotH, highlightData, targetPage }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const markRef = useRef<HTMLDivElement>(null);
    // A PDF.js RenderTask keeps painting after its effect is torn down. Two tasks sharing one
    // canvas corrupt each other's output, so the live one is tracked and cancelled explicitly.
    const renderTaskRef = useRef<any>(null);
    const [drawn, setDrawn] = useState(false);
    const [textRects, setTextRects] = useState<Array<{ left: number; top: number; width: number; height: number }>>([]);
    const [inView, setInView] = useState(false);

    // Draw a page only when it is within about one screen of the visible part.
    useEffect(() => {
        const el = areaRef.current;
        if (!el) return;
        const io = new IntersectionObserver(entries => setInView(entries.some(e => e.isIntersecting)), { rootMargin: '100% 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, []);

    useEffect(() => {
        let cancelled = false;
        const render = async () => {
            if (!pdfDoc || !canvasRef.current || !inView || cssW < 2 || cssH < 2) return;

            // Stop any paint that is still in flight before touching this canvas again.
            if (renderTaskRef.current) {
                try {
                    renderTaskRef.current.cancel();
                    await renderTaskRef.current.promise;
                } catch {
                    // A cancelled RenderTask rejects by design — nothing to handle.
                }
                renderTaskRef.current = null;
            }
            if (cancelled) return;

            const page = await pdfDoc.getPage(pageNum);
            if (cancelled) return;

            // Total rotation = the page's own rotation + the user's manual rotation.
            const nativeRotation = (page.rotate || 0);
            const totalRotation = ((nativeRotation + rotation) % 360 + 360) % 360;

            const deviceRatio = window.devicePixelRatio || 1;
            const wanted = Math.max(deviceRatio, 2);
            const pixelRatio = Math.max(1, Math.min(wanted, Math.sqrt(MAX_CANVAS_PIXELS / (cssW * cssH))));
            const cssVp = page.getViewport({ scale, rotation: totalRotation });
            const physVp = page.getViewport({ scale: scale * pixelRatio, rotation: totalRotation });

            // Draw into a fresh canvas and swap it in when done, so the old picture stays visible
            // (only resized) while the new one is drawn — no flash of an empty page on zoom.
            const fresh = document.createElement('canvas');
            fresh.width = Math.floor(physVp.width);
            fresh.height = Math.floor(physVp.height);
            const ctx = fresh.getContext('2d');
            if (!ctx) return;
            // A PDF page paints only its own content; anything it does not cover stays
            // transparent and picks up the dark viewer backdrop. Lay down paper first.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, fresh.width, fresh.height);

            const task = page.render({ canvasContext: ctx, viewport: physVp });
            renderTaskRef.current = task;
            try {
                await task.promise;
            } catch (err: any) {
                // Superseded by a newer render (resize, zoom, page change) — leave the canvas to it.
                if (err?.name === 'RenderingCancelledException') return;
                throw err;
            } finally {
                if (renderTaskRef.current === task) renderTaskRef.current = null;
            }
            if (cancelled || !canvasRef.current) return;
            const canvas = canvasRef.current;
            canvas.width = fresh.width;
            canvas.height = fresh.height;
            canvas.getContext('2d')?.drawImage(fresh, 0, 0);
            fresh.width = fresh.height = 0;
            setDrawn(true);

            // ---- Precise text highlighting via the viewport transform ----
            // We map each matched text item from PDF text-space into CSS-pixel space using
            // PDF.js's own viewport transform, then position lightweight overlay <div>s.
            // This keeps the highlight exactly on top of the text (the old canvas-draw math
            // drifted, especially for short values).
            const rects: Array<{ left: number; top: number; width: number; height: number }> = [];
            if (highlightData?.type === 'text' && typeof highlightData.value === 'string' && (targetPage == null || targetPage === pageNum)) {
                const query = highlightData.value.toLowerCase().trim();
                const queryNoSpace = query.replace(/\s+/g, '');
                if (queryNoSpace.length > 0) {
                    const textContent = await page.getTextContent();
                    if (cancelled) return;
                    const Util = (window as any).pdfjsLib.Util;

                    // Full device-space rect for a whole text item.
                    const itemRect = (item: any) => {
                        const tx = Util.transform(cssVp.transform, item.transform);
                        const fontHeight = Math.hypot(tx[2], tx[3]) || ((item.height || 0) * scale) || 10;
                        const fullWidth = (item.width || 0) * scale;
                        return {
                            left: tx[4],
                            top: tx[5] - fontHeight,
                            width: Math.max(fullWidth, 2),
                            height: fontHeight * 1.15
                        };
                    };

                    // Concatenate all items (spaces removed) so multi-item matches work,
                    // tracking each item's span so we can locate which items the match falls in.
                    let joined = '';
                    const spans: Array<{ start: number; end: number; item: any }> = [];
                    for (const item of textContent.items) {
                        const s = (((item as any).str) || '').toLowerCase().replace(/\s+/g, '');
                        if (!s) continue;
                        const start = joined.length;
                        joined += s;
                        spans.push({ start, end: joined.length, item });
                    }

                    // Find the text items that belong to the match.
                    const matchedItems = new Set<any>();
                    const idx = queryNoSpace.length > 3 ? joined.indexOf(queryNoSpace) : -1;
                    if (idx !== -1) {
                        const mStart = idx;
                        const mEnd = idx + queryNoSpace.length;
                        for (const span of spans) {
                            if (span.end > mStart && span.start < mEnd) matchedItems.add(span.item);
                        }
                    } else {
                        // A short value: the first whole word that equals it (pieces rebuilt).
                        const word = pdfWords(textContent.items).find(w => w.text.toLowerCase() === queryNoSpace);
                        if (word) word.items.forEach(it => matchedItems.add(it));
                        if (matchedItems.size === 0) for (const item of textContent.items) {
                            const str = (((item as any).str) || '').toLowerCase().trim();
                            const sNoSpace = str.replace(/\s+/g, '');
                            if (!sNoSpace) continue;
                            let isMatch = false;
                            if (queryNoSpace === sNoSpace) isMatch = true;
                            else if (queryNoSpace.length >= 8 && sNoSpace.includes(queryNoSpace)) isMatch = true;
                            else if (query.length <= 3) {
                                const words = str.split(/[\s,.\-]+/);
                                if (words.includes(query)) isMatch = true;
                            }
                            if (isMatch) { matchedItems.add(item); break; }
                        }
                    }

                    // Highlight the FULL LINE(S) that contain the matched text. A value sitting
                    // inside a sentence/paragraph (e.g. "…is 0.1 g.") then gets a clean box over
                    // its whole line instead of a drifting fragment box. We group every text item
                    // into lines by vertical position and box each line that holds a matched item.
                    if (matchedItems.size > 0) {
                        const withRect = spans.map(s => {
                            const r = itemRect(s.item);
                            return { item: s.item, r, cy: r.top + r.height / 2, h: r.height };
                        });
                        const lines: Array<{ cy: number; h: number; items: typeof withRect }> = [];
                        for (const it of [...withRect].sort((a, b) => a.cy - b.cy)) {
                            let line = lines.find(L => Math.abs(L.cy - it.cy) <= Math.max(L.h, it.h) * 0.6);
                            if (!line) { line = { cy: it.cy, h: it.h, items: [] }; lines.push(line); }
                            line.items.push(it);
                            line.h = Math.max(line.h, it.h);
                            line.cy = line.items.reduce((sum, x) => sum + x.cy, 0) / line.items.length;
                        }
                        for (const L of lines) {
                            if (!L.items.some(x => matchedItems.has(x.item))) continue;
                            const left = Math.min(...L.items.map(x => x.r.left));
                            const right = Math.max(...L.items.map(x => x.r.left + x.r.width));
                            const top = Math.min(...L.items.map(x => x.r.top));
                            const bottom = Math.max(...L.items.map(x => x.r.top + x.r.height));
                            rects.push({ left, top, width: right - left, height: bottom - top });
                        }
                    }
                }
            }
            if (!cancelled) setTextRects(rects);
        };
        render().catch(err => {
            // Superseded, or its document was closed because another PDF was opened: not an error.
            if (cancelled || isClosedDoc(pdfDoc) || err?.name === 'RenderingCancelledException') return;
            console.error('PDF page render failed:', err);
        });
        return () => {
            cancelled = true;
            renderTaskRef.current?.cancel();
        };
    }, [pdfDoc, pageNum, rotation, scale, cssW, cssH, inView, targetPage, highlightData?.type === 'text' ? highlightData.value : 'non-text']);

    // Coordinate-based highlight (paragraph / section boxes) as a % overlay over the page.
    const coordsBox = useMemo(() => {
        if (!highlightData || highlightData.type !== 'coords') return null;
        const [p, y1, x1, y2, x2] = highlightData.value as number[];
        if (p !== pageNum) return null;

        const rot = ((rotation % 360) + 360) % 360;
        const rotatePoint = (x: number, y: number) => {
            switch (rot) {
                case 90: return { x: 1000 - y, y: x };
                case 180: return { x: 1000 - x, y: 1000 - y };
                case 270: return { x: y, y: 1000 - x };
                default: return { x, y };
            }
        };

        const a = rotatePoint(x1, y1);
        const b = rotatePoint(x2, y2);
        const rawYmin = Math.min(a.y, b.y);
        const rawYmax = Math.max(a.y, b.y);
        const rawXmin = Math.min(a.x, b.x);
        const rawXmax = Math.max(a.x, b.x);
        const rawH = rawYmax - rawYmin;
        const rawW = rawXmax - rawXmin;
        const padY = rawH < 50 ? rawH * 0.15 : rawH * 0.1;
        const padX = rawW < 80 ? rawW * 0.05 : rawW * 0.03;
        const ymin = Math.max(0, rawYmin - padY);
        const ymax = Math.min(1000, rawYmax + padY);
        const xmin = Math.max(0, rawXmin - padX);
        const xmax = Math.min(1000, rawXmax + padX);

        return {
            top: `${ymin / 10}%`,
            left: `${xmin / 10}%`,
            width: `${(xmax - xmin) / 10}%`,
            height: `${(ymax - ymin) / 10}%`
        };
    }, [highlightData, pageNum, rotation]);

    // When zoomed in, the marked text can be outside the visible part of its page: bring it into view.
    const hasMark = !!coordsBox || textRects.length > 0;
    useEffect(() => {
        if (!hasMark || !drawn) return;
        const t = setTimeout(() => markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }), 450);
        return () => clearTimeout(t);
    }, [hasMark, drawn, textRects, coordsBox]);

    return (
        <div ref={areaRef} className="flex items-center justify-center p-3" style={{ width: Math.max(slotW, cssW + 24), minHeight: slotH }}>
            <div className="relative shrink-0" style={{ width: cssW, height: cssH }}>
                <canvas ref={canvasRef} className={`block shadow-paper ${drawn ? '' : 'bg-white'}`} style={{ width: cssW, height: cssH }} />
                {(coordsBox || textRects.length > 0) && (
                    <div className="absolute inset-0 pointer-events-none">
                        {coordsBox && (
                            <div ref={markRef} className="absolute pdf-mark" style={coordsBox} />
                        )}
                        {textRects.map((r, i) => (
                            <div
                                key={i}
                                ref={i === 0 && !coordsBox ? markRef : undefined}
                                className="absolute pdf-mark"
                                style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Checking extracted values against the PDF text ---
// A value counts as "in the PDF" when it appears there word for word, ignoring case, spacing and
// punctuation ("BCR-017" matches "BCR® – 017"). Anything else was derived by the model and is
// flagged for the user to check.
export interface PdfTextIndex { joined: string; tokens: Set<string>; hasText: boolean }

const verifyNorm = (s: string) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.,%]/g, '');
// A decimal comma and a decimal point are the same number: the generator writes "4.7" where a
// German certificate prints "4,7". Applied to the PDF text and to the value alike.
const decimalPoint = (s: string) => s.replace(/(\d),(?=\d)/g, '$1.');

const buildPdfTextIndex = (pageTexts: string[]): PdfTextIndex => {
    const spaced = pageTexts.join(' ');
    const joined = decimalPoint(verifyNorm(spaced));
    const tokens = new Set<string>();
    for (const t of spaced.split(/\s+/)) {
        const n = verifyNorm(t);
        if (!n) continue;
        tokens.add(n);
        tokens.add(decimalPoint(n));
        // A number with a footnote mark or punctuation glued on ("4.7¹" is "4.71" after
        // normalising, "4.7," "4.7)") also counts as the number itself.
        const num = t.match(/^[<>≤≥~±]?(\d+(?:[.,]\d+)?)[^\d]*$/);
        if (num) tokens.add(decimalPoint(num[1]));
    }
    // Scanned certificates have no text layer: nothing can be checked automatically.
    return { joined, tokens, hasText: joined.length > 200 };
};

// Footnote or list markers a value may start with ("2) half-width …", "a) …", "• …").
const LEADING_MARKER = /^\s*(?:\(?[0-9a-z]{1,2}\)|[0-9]{1,2}\.(?=\s)|[*•\-–])\s*/i;

const isInPdf = (text: string, index: PdfTextIndex): boolean => {
    const v = decimalPoint(verifyNorm(String(text).replace(LEADING_MARKER, '')));
    if (!v) return true;
    if (v.length <= 3) return index.tokens.has(v) || index.tokens.has(v.replace(/[.,%]+$/, ''));
    if (index.joined.includes(v)) return true;
    // A longer text that strings together several sentences of the PDF still counts as found.
    const parts = String(text).split(/[;:\n]+|\.\s+/).map(p => decimalPoint(verifyNorm(p))).filter(p => p.length >= 12);
    return parts.length > 1 && parts.every(p => index.joined.includes(p));
};

type VerifyStatus = 'check' | 'checked' | null;
interface VerifyApi {
    status: (value: unknown, source?: unknown) => VerifyStatus;
    setChecked: (value: unknown, checked: boolean) => void;
}
const VerifyContext = React.createContext<VerifyApi>({ status: () => null, setChecked: () => {} });

/**
 * Links between the form and the PDF. `hasPdf`: a PDF is shown, so "Show in the PDF" can mark a value
 * in it (without a PDF the buttons are not shown). `autoLocate`: the AI filled in this document, so a
 * field marks its source in the PDF as soon as it is focused. A document entered by hand or opened from
 * an XML file is not searched on every focus; its values can still be looked up with the buttons.
 */
const PdfLinkContext = React.createContext<{ hasPdf: boolean; autoLocate: boolean }>({ hasPdf: false, autoLocate: false });

/** Fields the model filled in, by tab, with the PDF wording where the value was converted. */
const collectVerifiable = (d: DRMD): { tab: string; value: string; source?: string }[] => {
    const out: { tab: string; value: string; source?: string }[] = [];
    const add = (tab: string, value: unknown, source?: unknown) => {
        const v = String(value ?? '').trim();
        if (v) out.push({ tab, value: v, source: source ? String(source) : undefined });
    };
    d.administrativeData.producers.forEach(p => {
        const o: any = p.originalTexts || {};
        add('admin', p.name, o.name); add('admin', p.email, o.email); add('admin', p.phone, o.phone); add('admin', p.fax, o.fax);
        add('admin', p.address.street, o.street); add('admin', p.address.streetNo, o.streetNo); add('admin', p.address.postCode, o.postCode);
        add('admin', p.address.city, o.city); add('admin', p.address.countryCode, o.countryCode);
    });
    d.administrativeData.responsiblePersons.forEach(r => {
        const o: any = r.originalTexts || {};
        add('admin', r.name, o.name); add('admin', r.role, o.role); add('admin', r.description, o.description);
    });
    d.materials.forEach(m => {
        const o: any = m.originalTexts || {};
        add('materials', m.name, o.name); add('materials', m.rmCode); add('materials', m.materialClass, o.materialClass);
        add('materials', m.itemQuantities, o.itemQuantities); add('materials', m.description, o.description); add('materials', m.minimumSampleSize, o.minimumSampleSize);
        (m.materialIdentifiers || []).forEach(mid => {
            const scheme = (mid.scheme || '').toLowerCase();
            if (scheme === 'cas' || scheme === 'inchikey' || !mid.value) return;
            const hasScheme = mid.scheme && mid.scheme !== 'MaterialID' && mid.scheme.trim() !== '';
            add('materials', hasScheme ? `${mid.scheme}-${mid.value}` : mid.value, mid.value);
        });
    });
    d.properties.forEach(p => {
        add('properties', p.description); add('properties', p.procedures);
        p.results.forEach(r => {
            add('properties', r.name); add('properties', r.description);
            r.quantities.forEach(q => {
                add('properties', q.name); add('properties', q.value); add('properties', q.uncertainty);
                add('properties', q.unit); add('properties', q.coverageFactor); add('properties', q.coverageProbability);
            });
        });
    });
    const st: any = d.statements.official; const so: any = st.originalTexts || {};
    ['intendedUse', 'commutability', 'storageInformation', 'handlingInstructions', 'metrologicalTraceability', 'healthAndSafety', 'subcontractors', 'legalNotice', 'referenceToCertificationReport']
        .forEach(k => add('statements', st[k], so[k]));
    d.statements.custom.forEach(c => { add('statements', c.name); add('statements', c.content); });
    return out;
};

// --- Main PDF Viewer Wrapper ---
// Pages are stacked vertically in a scroll area. At 100 % each page is fitted into the pane (whole
// page visible); the zoom buttons enlarge it in small steps, and the pane then scrolls in both
// directions. Prev/Next jump between pages, and a highlight scrolls to its page and into view.
// Zoom steps are deliberately small (a quarter at a time), so a click never jumps far.
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const PdfViewer: React.FC<{
    url: string;
    fileName?: string;
    highlightData: HighlightData | null;
    /** partial = only a sentence or phrase of the value was found, and it is marked instead. */
    onTextNotFound: (partial: boolean) => void;
    /** The value is not in the PDF as written, but in another form (e.g. a date written out). */
    onAlternativeFound?: (found: string) => void;
    onTextIndex?: (index: PdfTextIndex | null) => void;
    /** The pane fills the whole window; the button in the toolbar switches it. */
    enlarged?: boolean;
    onToggleEnlarge?: () => void;
}> = ({ url, fileName, highlightData, onTextNotFound, onAlternativeFound, onTextIndex, enlarged, onToggleEnlarge }) => {
    // What is actually marked: the highlight asked for, or the part of it that was found.
    const [shownHighlight, setShownHighlight] = useState<HighlightData | null>(highlightData);
    useEffect(() => { setShownHighlight(highlightData); }, [highlightData]);
    // Text of every page, read once per document (used for searching and for checking values).
    // Kept with the document it belongs to, so a late answer for a closed PDF is never used for the next one.
    const pageTextsRef = useRef<{ doc: any; texts: { spaced: string; joined: string }[] } | null>(null);
    const onTextIndexRef = useRef(onTextIndex);
    useEffect(() => { onTextIndexRef.current = onTextIndex; });
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [targetPage, setTargetPage] = useState<number | null>(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const [zoom, setZoom] = useState(1);
    // Size of each page at scale 1 with its own rotation (before the user's rotation).
    const [pageSizes, setPageSizes] = useState<Array<{ w: number; h: number }>>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

    // Keep the latest callbacks in refs so the page-search effect doesn't re-run
    // on every parent render (the props are recreated inline each time).
    const onTextNotFoundRef = useRef(onTextNotFound);
    useEffect(() => { onTextNotFoundRef.current = onTextNotFound; });
    const onAlternativeFoundRef = useRef(onAlternativeFound);
    useEffect(() => { onAlternativeFoundRef.current = onAlternativeFound; });

    // Measure the scroll area: at 100 % a page is fitted into it.
    useEffect(() => {
        if (!scrollRef.current) return;
        const measure = () => {
            const el = scrollRef.current;
            if (!el) return;
            const w = el.clientWidth, h = el.clientHeight;
            setBox(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(scrollRef.current);
        return () => ro.disconnect();
    }, []);

    // CSS size and PDF.js scale of every page at the current zoom.
    const layout = useMemo(() => pageSizes.map(size => {
        const quarter = rotation % 180 !== 0;
        const w = quarter ? size.h : size.w;
        const h = quarter ? size.w : size.h;
        const fit = Math.max(0.05, Math.min((box.w - 24) / w, (box.h - 24) / h));
        const scale = fit * zoom;
        return { scale, cssW: Math.floor(w * scale), cssH: Math.floor(h * scale) };
    }), [pageSizes, rotation, box.w, box.h, zoom]);

    const scrollToPage = useCallback((i: number) => {
        requestAnimationFrame(() => {
            const el = pageRefs.current[i - 1];
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, []);

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        // The current page is the last one whose top is above the upper third of the pane.
        const mark = el.scrollTop + el.clientHeight / 3;
        let idx = 1;
        pageRefs.current.forEach((p, i) => { if (p && p.offsetTop <= mark) idx = i + 1; });
        setCurrentPage(Math.min(Math.max(1, idx), numPages || 1));
    };

    useEffect(() => {
        let cancelled = false;
        let opened: any = null;
        const loadPdf = async () => {
            if (!url || !(window as any).pdfjsLib) return;
            try {
                pageTextsRef.current = null;
                onTextIndexRef.current?.(null);
                // See utils/pdfjs.ts: no scripts, no XFA, embedded image decoders, nothing downloaded.
                const pdf = await openPdf({ url }, { cancelled: () => cancelled }).promise;
                if (cancelled) { closePdf(pdf); return; }
                opened = pdf;
                const sizes: Array<{ w: number; h: number }> = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const vp = page.getViewport({ scale: 1, rotation: page.rotate || 0 });
                    sizes.push({ w: vp.width, h: vp.height });
                }
                if (cancelled) return;
                setPageSizes(sizes);
                setPdfDoc(pdf);
                setNumPages(pdf.numPages);
                setCurrentPage(1);
                setRotation(0);
                setZoom(1);
                setTargetPage(null);
                pageRefs.current = [];
            } catch (err) {
                // Closed meanwhile because another PDF was chosen: not an error.
                if (!cancelled) console.error("Failed to load PDF", err);
            }
        };
        loadPdf();
        return () => { cancelled = true; closePdf(opened); };
    }, [url]);

    const loadPageTexts = useCallback(async (doc: any): Promise<{ spaced: string; joined: string }[]> => {
        const cached = pageTextsRef.current;
        if (cached && cached.doc === doc) return cached.texts;
        const texts: { spaced: string; joined: string }[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const tc = await page.getTextContent();
            const spaced = pdfWords(tc.items).map(w => w.text).join(' ').toLowerCase();
            texts.push({ spaced, joined: spaced.replace(/\s+/g, '') });
        }
        pageTextsRef.current = { doc, texts };
        return texts;
    }, []);

    // Build the text index used to check extracted values against the PDF.
    useEffect(() => {
        let cancelled = false;
        if (!pdfDoc) return;
        loadPageTexts(pdfDoc)
            .then(texts => { if (!cancelled) onTextIndexRef.current?.(buildPdfTextIndex(texts.map(t => t.spaced))); })
            .catch(err => { if (!cancelled && !isClosedDoc(pdfDoc)) console.warn('Could not read the PDF text:', err); });
        return () => { cancelled = true; };
    }, [pdfDoc, loadPageTexts]);

    // When the highlight target changes, jump to the page that actually contains it.
    useEffect(() => {
        let cancelled = false;
        const findPage = async () => {
            if (!pdfDoc || !highlightData || numPages === 0) return;

            if (highlightData.type === 'coords') {
                const p = (highlightData.value as number[])[0];
                if (p >= 1 && p <= numPages) { setTargetPage(p); scrollToPage(p); }
                return;
            }

            const texts = await loadPageTexts(pdfDoc);
            if (cancelled) return;
            const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pageOf = (value: string): number => {
                const raw = value.toLowerCase();
                const q = raw.replace(/\s+/g, '');
                if (q.length === 0) return -1;
                const wordRe = raw.trim().length <= 3 ? new RegExp(`\\b${escapeRe(raw.trim())}\\b`) : null;
                return texts.findIndex(({ spaced, joined }) => (wordRe ? wordRe.test(spaced) : joined.includes(q)));
            };

            const hit = pageOf((highlightData.value as string) || '');
            if (hit >= 0) {
                setTargetPage(hit + 1);
                scrollToPage(hit + 1);
                return;
            }

            // Not word for word, but perhaps in another form: a date written out ("01 June 2020"
            // for 2020-06-01), a country by its name or by a postal address for a country code.
            for (const alt of highlightData.alternatives || []) {
                const altHit = pageOf(alt);
                if (altHit >= 0) {
                    setShownHighlight({ type: 'text', value: alt });
                    setTargetPage(altHit + 1);
                    scrollToPage(altHit + 1);
                    onAlternativeFoundRef.current?.(alt);
                    return;
                }
            }

            // Not word for word. Mark the sentence or phrase of the value that IS in the PDF, so
            // the user sees what the value was derived from.
            const original = (highlightData.value as string) || '';
            const sentences = original.split(/[;:\n]+|\.\s+/).map(t => t.trim()).filter(t => t.replace(/\s+/g, '').length >= 12)
                .sort((a, b) => b.length - a.length);
            const words = original.split(/\s+/).filter(Boolean);
            const windows: string[] = [];
            for (const size of [8, 5]) {
                for (let start = 0; start + size <= words.length; start += 2) {
                    const w = words.slice(start, start + size).join(' ');
                    if (w.replace(/\s+/g, '').length >= 14) windows.push(w);
                }
            }
            for (const fragment of [...sentences, ...windows]) {
                const fq = fragment.toLowerCase().replace(/\s+/g, '');
                const fragHit = texts.findIndex(t => t.joined.includes(fq));
                if (fragHit >= 0) {
                    setShownHighlight({ type: 'text', value: fragment });
                    setTargetPage(fragHit + 1);
                    scrollToPage(fragHit + 1);
                    onTextNotFoundRef.current(true);
                    return;
                }
            }
            if (!cancelled) { setTargetPage(null); onTextNotFoundRef.current(false); }
        };
        findPage().catch(err => { if (!cancelled && !isClosedDoc(pdfDoc)) console.warn('Could not search the PDF:', err); });
        return () => { cancelled = true; };
    }, [pdfDoc, highlightData, numPages, scrollToPage, loadPageTexts]);

    const goPrev = () => scrollToPage(Math.max(1, currentPage - 1));
    const goNext = () => scrollToPage(Math.min(numPages || 1, currentPage + 1));

    // Zoom keeps the same part of the document in view: the scroll position is kept as a share of
    // the whole, and restored once the pages have their new size.
    const zoomRatioRef = useRef<{ x: number; y: number } | null>(null);
    const changeZoom = useCallback((dir: 1 | -1 | 0) => {
        const el = scrollRef.current;
        if (el) zoomRatioRef.current = {
            x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
            y: (el.scrollTop + el.clientHeight / 2) / Math.max(1, el.scrollHeight),
        };
        setZoom(z => {
            if (dir === 0) return 1;
            const i = ZOOM_STEPS.findIndex(s => s >= z - 1e-6);
            const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (i < 0 ? ZOOM_STEPS.length - 1 : i) + dir))];
            return next;
        });
    }, []);
    useEffect(() => {
        const el = scrollRef.current, r = zoomRatioRef.current;
        if (!el || !r) return;
        zoomRatioRef.current = null;
        requestAnimationFrame(() => {
            el.scrollTop = Math.max(0, r.y * el.scrollHeight - el.clientHeight / 2);
            el.scrollLeft = Math.max(0, r.x * el.scrollWidth - el.clientWidth / 2);
        });
    }, [zoom]);

    // Ctrl + mouse wheel (or a pinch on a touchpad) zooms by ONE step per movement: a turn of the
    // wheel or a pinch sends a burst of events, and only the first one zooms. Further steps follow
    // only when the movement goes on (every 600 ms) or after a short pause, so the page never jumps
    // straight to a large size.
    const wheelGestureRef = useRef({ last: 0, step: 0 });
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            if (Math.abs(e.deltaY) < 1) return;
            const now = Date.now();
            const g = wheelGestureRef.current;
            const sameMovement = now - g.last < 300;
            g.last = now;
            if (sameMovement && now - g.step < 600) return;
            g.step = now;
            changeZoom(e.deltaY < 0 ? 1 : -1);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [changeZoom, pdfDoc]);

    const deskBtn = "inline-flex items-center justify-center w-7 h-7 rounded text-desk-text hover:bg-desk-line hover:text-white disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors";
    const ready = pdfDoc && numPages > 0 && box.h > 0 && layout.length === numPages;
    return (
        <div className="flex-1 min-h-0 flex flex-col bg-desk">
            <div className="flex items-center gap-1 h-10 px-2 bg-desk-raised border-b border-desk-line text-desk-text text-xs select-none">
                <button onClick={goPrev} disabled={currentPage <= 1} className={deskBtn} title="Previous page" aria-label="Previous page">
                    <Icon name="chevronLeft" />
                </button>
                <span className="tabular-nums px-1 min-w-[84px] text-center">
                    Page {numPages ? currentPage : '–'} of {numPages || '–'}
                </span>
                <button onClick={goNext} disabled={currentPage >= numPages} className={deskBtn} title="Next page" aria-label="Next page">
                    <Icon name="chevronRight" />
                </button>
                <span className="flex-1 min-w-0 truncate text-center px-3 text-desk-text/80" title={fileName || undefined}>{fileName}</span>
                <button onClick={() => changeZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]} className={deskBtn} title="Zoom out (Ctrl + mouse wheel)" aria-label="Zoom out">
                    <Icon name="minus" />
                </button>
                <button onClick={() => changeZoom(0)} className="h-7 px-1.5 rounded tabular-nums text-desk-text hover:bg-desk-line hover:text-white min-w-[48px]" title="Fit the whole page (100 %)" aria-label="Zoom: fit the whole page">
                    {Math.round(zoom * 100)} %
                </button>
                <button onClick={() => changeZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} className={deskBtn} title="Zoom in (Ctrl + mouse wheel)" aria-label="Zoom in">
                    <Icon name="plus" />
                </button>
                <span className="w-px h-5 bg-desk-line mx-1" aria-hidden="true" />
                <button onClick={() => setRotation(r => (r + 90) % 360)} className={deskBtn} title="Rotate 90°" aria-label="Rotate page">
                    <Icon name="rotate" />
                </button>
                {onToggleEnlarge && (
                    <button onClick={onToggleEnlarge} className={deskBtn} aria-pressed={!!enlarged}
                        title={enlarged ? 'Back to the form (Esc)' : 'Enlarge the PDF to the whole window'}
                        aria-label={enlarged ? 'Reduce the PDF' : 'Enlarge the PDF'}>
                        <Icon name={enlarged ? 'minimize' : 'maximize'} />
                    </button>
                )}
            </div>
            <div ref={scrollRef} onScroll={handleScroll} className="desk-scroll flex-1 min-h-0 overflow-auto relative">
                {ready ? (
                    Array.from({ length: numPages }, (_, idx) => (
                        <div
                            key={idx + 1}
                            ref={el => { pageRefs.current[idx] = el; }}
                            className="flex-shrink-0"
                        >
                            <PdfPage
                                pdfDoc={pdfDoc}
                                pageNum={idx + 1}
                                rotation={rotation}
                                scale={layout[idx].scale}
                                cssW={layout[idx].cssW}
                                cssH={layout[idx].cssH}
                                slotW={box.w}
                                slotH={box.h}
                                highlightData={shownHighlight}
                                targetPage={targetPage}
                            />
                        </div>
                    ))
                ) : (
                    <div className="h-full flex items-center justify-center gap-2 text-desk-text text-sm"><Spinner size={14} /> Opening PDF…</div>
                )}
            </div>
        </div>
    );
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Share of the window the certificate pane takes at first (the form gets the rest, for its tabs). */
const DEFAULT_SPLIT = 0.45;

// Bulk extraction is unattended, so it is paced rather than run flat out. Hammering the API
// back-to-back is what trips per-minute rate limits, and a rate-limited document comes back
// empty — which is how a run ends up "finished" with nothing extracted.
const BULK_COOLDOWN_MS = 5000;      // breathing room between documents
const BULK_RETRY_COOLDOWN_MS = 20000; // longer pause before a second attempt at one document
const BULK_ATTEMPTS_PER_FILE = 2;
// Identifier look-ups (ROR / CAS) are a refinement. Past this budget a document's remaining look-ups
// use the deterministic API data only, so they can never hold an extraction hostage.
const IDENTIFIER_LLM_DEADLINE_MS = 180000;

/** A new, empty producer with its own address and identifier objects (never shared with INITIAL_PRODUCER,
 *  which the form's field editors would otherwise change for every document created afterwards). */
const newProducer = () => ({
    ...INITIAL_PRODUCER,
    uuid: generateUUID(),
    address: { ...INITIAL_PRODUCER.address },
    organizationIdentifiers: INITIAL_PRODUCER.organizationIdentifiers.map(id => ({ ...id })),
});

// Turns an arbitrary label into something safe to use as a file name.
const sanitizeFilename = (value: string) => value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_.]/g, '');

// ---------------------------------------------------------------------------------------------
// Rules the generator applies to every extraction, whatever the model returned.
// ---------------------------------------------------------------------------------------------

/**
 * The dispatch date ("Time After Dispatch") is only known when the producer ships the material,
 * so it is never taken from the certificate: any date the model returns is dropped. The user can
 * still enter one by hand.
 */
export const withoutDispatchDate = (doc: DRMD): DRMD => {
    const ad: any = doc.administrativeData;
    const fieldCoordinates = ad.fieldCoordinates ? { ...ad.fieldCoordinates } : ad.fieldCoordinates;
    const originalTexts = ad.originalTexts ? { ...ad.originalTexts } : ad.originalTexts;
    if (fieldCoordinates) delete fieldCoordinates.dateOfIssue;
    if (originalTexts) delete originalTexts.dateOfIssue;
    return { ...doc, administrativeData: { ...ad, dateOfIssue: '', fieldCoordinates, originalTexts } };
};

/**
 * One material link per property set (drmd:properties @refId), as the DRMD guidance document
 * recommends. A property set whose tables belong to different materials is split into one set per
 * material, so no link is hidden at table level.
 */
export const normalizeMaterialLinks = (doc: DRMD): DRMD => {
    const properties: DRMD['properties'] = [];
    (doc.properties || []).forEach(p => {
        const groups = new Map<string, typeof p.results>();
        (p.results || []).forEach(r => {
            const key = r.materialRef || p.materialRef || '';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push({ ...r, materialRef: undefined });
        });
        if (groups.size <= 1) {
            const key = groups.size ? [...groups.keys()][0] : (p.materialRef || '');
            properties.push({ ...p, materialRef: key || undefined, results: groups.size ? [...groups.values()][0] : [] });
            return;
        }
        let first = true;
        groups.forEach((results, key) => {
            properties.push({ ...p, uuid: first ? p.uuid : generateUUID(), id: first ? p.id : '', materialRef: key || undefined, results });
            first = false;
        });
    });
    return { ...doc, properties };
};

/** Everything that is done to a freshly extracted document before it is shown or saved. */
const finishExtractedDoc = (doc: DRMD): DRMD => normalizeMaterialLinks(withoutDispatchDate(doc));

// ---------------------------------------------------------------------------------------------
// Folder runs. Chrome and Edge can write into a folder the user picks (File System Access API),
// so each certificate's XML and HTML report are saved next to its PDF the moment it is done.
// Nothing piles up in the tab, an interrupted run can simply be started again (PDFs that already
// have an XML are skipped), and the results are on disk even if the tab is closed.
// Browsers without the API fall back to keeping results in the tab with a ZIP download.
// ---------------------------------------------------------------------------------------------
const canWriteFolders = typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';

/** "BCR-017_certificate.pdf" → "BCR-017_certificate" (results are saved under the PDF's name). */
const outputBaseName = (pdfName: string) => pdfName.replace(/\.pdf$/i, '');

type PickedPdf = { file: File; dir?: FileSystemDirectoryHandle; path: string; hasXml?: boolean };

/** Every PDF in a folder and its subfolders, with a note of which already have an XML beside them. */
const scanFolderForPdfs = async (dir: FileSystemDirectoryHandle, prefix = '', out: PickedPdf[] = []): Promise<PickedPdf[]> => {
    const names = new Set<string>();
    const entries: any[] = [];
    for await (const entry of (dir as any).values()) { entries.push(entry); names.add(entry.name); }
    for (const entry of entries) {
        if (entry.kind === 'directory') {
            if (!entry.name.startsWith('.')) await scanFolderForPdfs(entry, `${prefix}${entry.name}/`, out);
        } else if (entry.kind === 'file' && /\.pdf$/i.test(entry.name)) {
            out.push({ file: await entry.getFile(), dir, path: prefix + entry.name, hasXml: names.has(`${outputBaseName(entry.name)}.xml`) });
        }
    }
    return out;
};

/**
 * PDFs of a folder dropped onto the page, read through the browser's file-entry interface (every
 * browser has it). Results of such a run stay in the tab: this interface cannot save into the folder.
 */
const readDroppedFolder = async (dir: any, prefix = '', out: PickedPdf[] = []): Promise<PickedPdf[]> => {
    const reader = dir.createReader();
    for (;;) {
        // readEntries hands out a folder's entries in batches; an empty batch means all were read.
        const batch: any[] = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const entry of batch) {
            if (entry.name.startsWith('.')) continue;
            if (entry.isDirectory) await readDroppedFolder(entry, `${prefix}${entry.name}/`, out);
            else if (entry.isFile && /\.pdf$/i.test(entry.name)) {
                out.push({ file: await new Promise<File>((resolve, reject) => entry.file(resolve, reject)), path: prefix + entry.name });
            }
        }
    }
    return out;
};

const byPath = (a: PickedPdf, b: PickedPdf) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });

/** Frees a PDF's blob: address once the viewer has surely let go of it (it may still be reading it). */
const revokeLater = (url: string) => { setTimeout(() => URL.revokeObjectURL(url), 30000); };

/** A blob: address for an embedded PDF (base64), or null when the data cannot be read. */
const pdfUrlFromBase64 = (data: string): string | null => {
    try {
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // Always typed as PDF: the viewer only shows PDFs, whatever type the file claims.
        return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    } catch (err) {
        console.warn('Could not read the embedded PDF', err);
        return null;
    }
};

/** A PDF or folder chosen before an API key was entered. It starts as soon as a working key is there. */
type PaneRestore = { url: string | null; name: string; rmData: string | null };
type PendingUpload =
    | { kind: 'pdf'; file: File; previewUrl: string; restore: PaneRestore }
    | { kind: 'bulk'; picked: PickedPdf[]; folderName: string | null; label: string; restore: PaneRestore };

const writeTextFile = async (dir: FileSystemDirectoryHandle, name: string, text: string) => {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await (handle as any).createWritable();
    await writable.write(new Blob([text], { type: name.endsWith('.xml') ? 'application/xml' : 'text/html' }));
    await writable.close();
};

/** Writes "<pdf name>.xml" and "<pdf name>.html" next to the PDF; returns the XML's name. */
const saveResultFiles = async (dir: FileSystemDirectoryHandle, pdfName: string, doc: DRMD, xml?: string): Promise<string> => {
    const base = outputBaseName(pdfName);
    await writeTextFile(dir, `${base}.xml`, xml ?? generateDrmdXml(doc));
    await writeTextFile(dir, `${base}.html`, generateHtmlReport(doc));
    return `${base}.xml`;
};

/**
 * The document without the source PDF's base64 (often several MB per certificate). Bulk rows keep
 * this light copy; the PDF is read back from its file when an XML has to be built again.
 */
const withoutSourcePdf = (doc: DRMD, pdfName: string): DRMD => {
    const docs = doc.binaryDocuments || [];
    let idx = docs.findIndex(d => d.fileName === pdfName);
    if (idx < 0) idx = docs.findIndex(d => (d.mimeType || '').includes('pdf'));
    if (idx < 0 || !docs[idx].data) return doc;
    return { ...doc, binaryDocuments: docs.map((d, i) => i === idx ? { ...d, data: '' } : d) };
};

const App: React.FC = () => {
  // A private copy with its own uniqueIdentifier — never the shared INITIAL_DRMD constant itself.
  const [drmdData, setDrmdData] = useState<DRMD>(() => createInitialDrmd());
  const drmdDataRef = useRef(drmdData);
  drmdDataRef.current = drmdData;
  // The document as it is now, for look-ups that finish later.
  const drmdRef = useRef(drmdData);
  drmdRef.current = drmdData;
  // Look-ups started with the magnifying-glass buttons, keyed by producer / material / table.
  const [lookups, setLookups] = useState<Record<string, LookupState>>({});
  // The untouched starting document. While the form still holds it, there is nothing to validate yet.
  const blankDocRef = useRef<DRMD>(drmdData);
  // AI provider settings. Keys live only in this component's memory: never stored, never in the page
  // markup, and each one is sent only to its own provider (see services/providers.ts).
  const [providerKeys, setProviderKeys] = useState<Record<ProviderId, string>>({ gemini: '', openai: '', anthropic: '', mistral: '', qwen: '', openrouter: '' });
  const [providerModels, setProviderModels] = useState<Record<ProviderId, string>>({ gemini: AUTO, openai: AUTO, anthropic: AUTO, mistral: AUTO, qwen: AUTO, openrouter: AUTO });
  // Region per provider, for providers with regions (Qwen). Keys, models and prices belong to one region.
  const [providerRegions, setProviderRegions] = useState<Partial<Record<ProviderId, string>>>(
      () => Object.fromEntries(PROVIDER_IDS.filter(id => PROVIDERS[id].regions).map(id => [id, PROVIDERS[id].regions![0].id])));
  const [providerChecks, setProviderChecks] = useState<Partial<Record<ProviderId, ProviderCheck>>>({});
  const [activeProvider, setActiveProvider] = useState<ProviderId>('gemini');
  const conn: LlmConnection = useMemo(() => ({
      provider: activeProvider,
      apiKey: providerKeys[activeProvider],
      model: providerModels[activeProvider],
      available: providerChecks[activeProvider]?.models,
      region: providerRegions[activeProvider],
  }), [activeProvider, providerKeys, providerModels, providerChecks, providerRegions]);
  const providerLabel = PROVIDERS[activeProvider].label;
  const connRef = useRef(conn);
  connRef.current = conn;
  const providerKeysRef = useRef(providerKeys);
  providerKeysRef.current = providerKeys;
  const providerRegionsRef = useRef(providerRegions);
  providerRegionsRef.current = providerRegions;

  // Another region has other models (and needs a key of that region): the last check no longer applies.
  const updateProviderRegion = (id: ProviderId, region: string) => {
      if (aiLockedRef.current) return;
      setProviderRegions(prev => ({ ...prev, [id]: region }));
      setProviderChecks(prev => ({ ...prev, [id]: undefined }));
  };

  const updateProviderKey = (id: ProviderId, value: string) => {
      if (aiLockedRef.current) return;
      // Copy-pasting a key very often carries a trailing space or newline, which providers reject.
      const key = value.trim();
      setProviderKeys(prev => ({ ...prev, [id]: key }));
      // A changed key has not been checked yet.
      setProviderChecks(prev => ({ ...prev, [id]: undefined }));
      // The first key entered decides the provider, so one key needs no further clicks.
      if (key && !providerKeysRef.current[activeProvider]) setActiveProvider(id);
  };

  // Asks the provider whether the key works and which of its models can read the certificates.
  const checkProviderKey = async (id: ProviderId) => {
      const key = providerKeysRef.current[id];
      const region = providerRegionsRef.current[id];
      if (!key || aiLockedRef.current) return;
      setProviderChecks(prev => ({ ...prev, [id]: { busy: true } }));
      try {
          const models = await listModels(id, key, region);
          // the key or the region was changed meanwhile
          if (providerKeysRef.current[id] !== key || providerRegionsRef.current[id] !== region) return;
          setProviderChecks(prev => ({ ...prev, [id]: {
              busy: false, ok: true, models,
              msg: models.length > 0
                  ? `Key works. ${models.length} model${models.length === 1 ? '' : 's'} of this key can read the certificates.`
                  : 'The key works, but none of its models can read PDF documents or images.',
          } }));
          // A chosen model the key cannot use goes back to Automatic.
          setProviderModels(prev => (prev[id] !== AUTO && !models.some(m => m.id === prev[id]) ? { ...prev, [id]: AUTO } : prev));
      } catch (err) {
          if (providerKeysRef.current[id] !== key || providerRegionsRef.current[id] !== region) return;
          setProviderChecks(prev => ({ ...prev, [id]: { busy: false, ok: false, msg: err instanceof Error ? err.message : String(err) } }));
      }
  };
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("home");
  // The table row whose identifiers are being edited (Properties tab), by quantity uuid.
  const [editingIdsFor, setEditingIdsFor] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [highlightData, setHighlightData] = useState<HighlightData | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'converted' | 'generated' | 'warning'>('warning');
  // A source the notice cites (the D-SI guide for a D-SI unit), opened in a new tab
  const [toastLink, setToastLink] = useState<{ href: string; label: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const bulkFolderInputRef = useRef<HTMLInputElement>(null);
  const bulkCancelRef = useRef<boolean>(false);
  // The File behind each bulk row, so failed rows can be retried without re-picking the folder.
  const bulkFilesRef = useRef<Map<string, File>>(new Map());
  // Folder runs: the folder that holds each row's PDF, where its results are written.
  const bulkDirsRef = useRef<Map<string, FileSystemDirectoryHandle>>(new Map());
  // Set when the browser refuses folder access; folder runs then keep results in the tab.
  const folderWriteBlockedRef = useRef(false);
  // The note shown before the first folder pick in this session.
  const folderIntroSeenRef = useRef(false);
  const [folderIntroOpen, setFolderIntroOpen] = useState(false);
  // Increments whenever a different document takes over the form (new upload, XML import, bulk
  // review). Late results from an earlier document check it and stand down instead of overwriting.
  const documentRunRef = useRef(0);

  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentFile: '' });
  // Background identifier look-up (ROR / CAS / InChIKey) for the document shown in the form.
  const [identifierStatus, setIdentifierStatus] = useState<string | null>(null);
  // The AI writing units in D-SI for the document on screen, and for single rows after a unit was typed.
  const [unitStatus, setUnitStatus] = useState<string | null>(null);
  const [unitBusy, setUnitBusy] = useState<Record<string, boolean>>({});
  // While a certificate or a folder is being processed (extraction, identifier look-ups, a folder run,
  // a look-up started by hand), the AI settings cannot be changed: every request of that work then goes
  // to the same provider and model, with the same key. They are free again when the work has finished.
  const aiLocked = isProcessing || bulkProcessing || !!identifierStatus || !!unitStatus || Object.values(unitBusy).some(Boolean) || Object.values(lookups).some(l => l.busy);
  const aiLockedRef = useRef(aiLocked);
  aiLockedRef.current = aiLocked;
  // Set when the AI's answer for the document on screen was still incomplete after re-asking.
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null);
  // Name of the certificate shown in the viewer.
  const [pdfName, setPdfName] = useState<string>("");
  // The bulk row whose document is open in the form. Edits made while reviewing it are written
  // back to that row, so "Download" and the ZIP export contain the corrected data.
  const [reviewingBulkId, setReviewingBulkId] = useState<string | null>(null);
  // Width of the certificate pane, as a share of the window (drag the divider to change it).
  const [splitRatio, setSplitRatio] = useState<number>(DEFAULT_SPLIT);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  // The certificate pane enlarged to the whole window (Esc or the button returns).
  const [pdfEnlarged, setPdfEnlarged] = useState(false);
  // Validate & export: the XML and the HTML report are shown when unfolded.
  const [xmlOpen, setXmlOpen] = useState(false);
  const [htmlOpen, setHtmlOpen] = useState(false);

  // A highlight belongs to the document it was made on.
  useEffect(() => { setHighlightData(null); setToastMessage(null); setPdfIndex(null); }, [pdfUrl]);

  // ---- The certificate pane shows the human-readable PDF of the document (Documents tab) ----
  // The base64 data of that PDF while the pane shows it. Null while the pane shows nothing, or a PDF
  // that is not (yet) part of the document: one that waits for an API key, or is being extracted.
  const shownRmDataRef = useRef<string | null>(null);
  /** Shows the human-readable PDF among `docs`, or empties the pane when it was removed. */
  const syncPaneWith = (docs: BinaryDocument[]) => {
      if (pendingUploadRef.current) return; // the pane shows the PDF that waits for a key
      const rm = (docs || []).find(d => d.rmDocument && d.data);
      const data = rm?.data || null;
      if (data === shownRmDataRef.current) return;
      if (!data) {
          if (shownRmDataRef.current === null) return;
          shownRmDataRef.current = null;
          setPdfUrl(prev => { if (prev) revokeLater(prev); return null; });
          setPdfName('');
          return;
      }
      const url = pdfUrlFromBase64(data);
      shownRmDataRef.current = url ? data : null;
      setPdfUrl(prev => { if (prev) revokeLater(prev); return url; });
      setPdfName(url ? rm!.fileName : '');
  };
  /** Changes the attached documents and keeps the pane in step with them. */
  const updateDocuments = (next: BinaryDocument[]) => {
      setDrmdData(p => ({ ...p, binaryDocuments: next }));
      syncPaneWith(next);
  };

  // ---- Which document is in the form, and which of its values the AI filled in ----
  // Every document that takes over the form gets its own key ("ai:3" extracted, "xml:4" opened from a
  // file, "new:5" entered by hand; a folder row has "row:<id>"). Only values the AI filled in are marked
  // for checking against the PDF: a value typed by hand or read from an XML file is the user's own.
  const docSeqRef = useRef(0);
  const [docKey, setDocKey] = useState('new:0');
  const aiValuesRef = useRef<Map<string, Set<string>>>(new Map());
  /** A new key for the document taking over the form; what was kept for the previous one is dropped. */
  const takeOverDoc = (kind: 'ai' | 'xml' | 'new') => {
      for (const map of [aiValuesRef.current, checkedRef.current]) {
          for (const key of [...map.keys()]) if (!key.startsWith('row:')) map.delete(key);
      }
      const key = `${kind}:${++docSeqRef.current}`;
      setDocKey(key);
      return key;
  };
  const rememberAiValues = (key: string, doc: DRMD) => {
      aiValuesRef.current.set(key, new Set(collectVerifiable(doc).map(item => verifyNorm(item.value)).filter(Boolean)));
  };

  // ---- Checking extracted values against the PDF ----
  const [pdfIndex, setPdfIndex] = useState<PdfTextIndex | null>(null);
  // Values the user has confirmed, per document (a folder row keeps its own set).
  const checkedRef = useRef<Map<string, Set<string>>>(new Map());
  const [checkedVersion, setCheckedVersion] = useState(0);
  const checkDocKey = reviewingBulkId ? `row:${reviewingBulkId}` : docKey;
  // The AI filled in the document in the form (extracted here, or a result of a folder run).
  const isAiDoc = aiValuesRef.current.has(checkDocKey);
  const isAiDocRef = useRef(isAiDoc);
  isAiDocRef.current = isAiDoc;
  const verifyApi = useMemo<VerifyApi>(() => {
      const active = !!pdfIndex && pdfIndex.hasText;
      const checked = checkedRef.current.get(checkDocKey) || new Set<string>();
      const aiValues = aiValuesRef.current.get(checkDocKey);
      return {
          status: (value, source) => {
              if (!active || !aiValues) return null;
              const v = String(value ?? '').trim();
              if (!v || !aiValues.has(verifyNorm(v)) || isInPdf(String(source ?? '').trim() || v, pdfIndex!)) return null;
              return checked.has(verifyNorm(v)) ? 'checked' : 'check';
          },
          setChecked: (value, isChecked) => {
              const key = verifyNorm(String(value ?? ''));
              if (!key) return;
              // A value the AI filled in and the user then edited stays shown as verified.
              if (isChecked) aiValues?.add(key);
              let set = checkedRef.current.get(checkDocKey);
              if (!set) { set = new Set(); checkedRef.current.set(checkDocKey, set); }
              if (isChecked) set.add(key); else set.delete(key);
              setCheckedVersion(n => n + 1);
          },
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfIndex, checkDocKey, checkedVersion]);

  // Name of the folder a folder run saves into (null: results are kept in this tab).
  const [bulkFolderName, setBulkFolderName] = useState<string | null>(null);
  // The document as it was opened for review; only changes after that are written back.
  const reviewBaselineRef = useRef<DRMD | null>(null);
  // A review edit waiting to be saved into the folder (debounced while typing).
  const pendingSaveRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; run: () => Promise<void> } | null>(null);
  const [reviewSave, setReviewSave] = useState<{ state: 'idle' | 'pending' | 'saving' | 'saved' | 'error'; message?: string }>({ state: 'idle' });

  /** Saves a pending review edit right away (before another document takes over the form). */
  const flushPendingSave = () => {
      const p = pendingSaveRef.current;
      if (!p) return;
      clearTimeout(p.timer);
      pendingSaveRef.current = null;
      p.run();
  };

  // Keep the reviewed bulk row in step with the form, and in a folder run its files on disk too.
  useEffect(() => {
      const id = reviewingBulkId;
      if (!id || drmdData === reviewBaselineRef.current) return;
      const doc = drmdData;
      const pdfName = bulkFilesRef.current.get(id)?.name || '';
      const v = validateDrmd(doc);
      const { rmCode, rmName } = extractRmInfo(doc);
      setBulkResults(prev => prev.map(r => r.id === id ? {
          ...r, drmdData: withoutSourcePdf(doc, pdfName), rmCode, rmName, xmlContent: "", htmlContent: "",
          validation: { errors: v.errors.length, conditionalErrors: v.conditionalErrors.length, warnings: v.warnings.length },
      } : r));

      const dir = bulkDirsRef.current.get(id);
      if (!dir || !pdfName) return;
      if (pendingSaveRef.current?.id === id) clearTimeout(pendingSaveRef.current.timer);
      else flushPendingSave();
      const run = async () => {
          setReviewSave({ state: 'saving' });
          try {
              const savedAs = await saveResultFiles(dir, pdfName, doc);
              setBulkResults(prev => prev.map(r => r.id === id ? { ...r, savedAs, saveError: undefined } : r));
              setReviewSave({ state: 'saved' });
          } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error('Saving the reviewed document failed:', err);
              setBulkResults(prev => prev.map(r => r.id === id ? { ...r, saveError: message } : r));
              setReviewSave({ state: 'error', message });
          }
      };
      setReviewSave({ state: 'pending' });
      pendingSaveRef.current = { id, run, timer: setTimeout(() => { pendingSaveRef.current = null; run(); }, 1200) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drmdData, reviewingBulkId]);

  // Everything lives in this tab only: warn before the tab is closed or reloaded with work in it.
  // A folder run's results are already on disk, so they need no warning.
  // A DRMD entered or edited by hand counts as work too (it exists only in this tab until it is saved).
  const hasWork = isProcessing || bulkProcessing || reviewSave.state === 'pending' || reviewSave.state === 'saving'
      || (bulkResults.length > 0 && !bulkFolderName)
      || ((!!pdfUrl || drmdData !== blankDocRef.current) && !(bulkFolderName && reviewingBulkId));
  useEffect(() => {
      if (!hasWork) return;
      const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasWork]);

  const startSplitDrag = (e: React.PointerEvent) => {
      const container = splitContainerRef.current;
      if (!container) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const move = (ev: PointerEvent) => {
          const ratio = (ev.clientX - rect.left) / rect.width;
          setSplitRatio(Math.min(0.7, Math.max(0.22, ratio)));
      };
      const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
  };
  const nudgeSplit = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setSplitRatio(r => Math.max(0.22, r - 0.03));
      if (e.key === 'ArrowRight') setSplitRatio(r => Math.min(0.7, r + 0.03));
  };

  // Enlarged PDF: Esc returns; without a PDF there is nothing to enlarge.
  useEffect(() => { if (!pdfUrl) setPdfEnlarged(false); }, [pdfUrl]);
  useEffect(() => {
      if (!pdfEnlarged) return;
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPdfEnlarged(false); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
  }, [pdfEnlarged]);

  // Tick while a document is processing. Without this the overlay shows one static line, so a
  // request that has stalled looks exactly like one that is working — the user has no way to tell
  // a slow extraction from a hung one.
  useEffect(() => {
      if (!isProcessing) { setElapsedSeconds(0); return; }
      const startedAt = Date.now();
      const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
      return () => clearInterval(timer);
  }, [isProcessing]);


  // A notice next to the marked source disappears after 10 seconds, or as soon as the user clicks or
  // types anywhere else (the next field they check brings its own notice).
  const toastRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
      if (!toastMessage) return;
      const timer = setTimeout(() => setToastMessage(null), 10000);
      const dismiss = (e: Event) => {
          if (toastRef.current && e.target instanceof Node && toastRef.current.contains(e.target)) return;
          setToastMessage(null);
      };
      // Listen only from the next moment on: the click that opened the notice must not close it.
      const arm = setTimeout(() => {
          document.addEventListener('pointerdown', dismiss, true);
          document.addEventListener('keydown', dismiss, true);
      }, 0);
      return () => {
          clearTimeout(timer); clearTimeout(arm);
          document.removeEventListener('pointerdown', dismiss, true);
          document.removeEventListener('keydown', dismiss, true);
      };
  }, [toastMessage]);

  // The notice sits at the bottom of the certificate pane. When the marked source lies under it
  // (an address at the foot of a page), it moves to the top of the pane, so the mark stays visible.
  const [toastAtTop, setToastAtTop] = useState(false);
  useEffect(() => {
      setToastAtTop(false);
      if (!toastMessage) return;
      const check = () => {
          const t = toastRef.current;
          if (!t) return;
          const tr = t.getBoundingClientRect();
          const covered = Array.from(document.querySelectorAll('section[aria-label="Certificate"] .pdf-mark')).some(m => {
              const r = m.getBoundingClientRect();
              return r.bottom > tr.top - 8 && r.top < tr.bottom + 8 && r.right > tr.left && r.left < tr.right;
          });
          if (covered) setToastAtTop(true);
      };
      // The mark appears once the page is searched and drawn, and may scroll into view: look a few times.
      const timers = [50, 300, 700, 1200, 2000].map(ms => setTimeout(check, ms));
      return () => timers.forEach(clearTimeout);
  }, [toastMessage]);

  const showToast = (message: string, type: 'converted' | 'generated' | 'warning', link?: { href: string; label: string }) => {
      setToastMessage(message);
      setToastType(type);
      setToastLink(link ?? null);
  };

  // While a D-SI unit is shown in the PDF, its own notice replaces the general ones of the search
  // (its D-SI form is never in the PDF word for word: the notice explains the conversion instead).
  const sourceNoticeRef = useRef<{ text: string; link?: { href: string; label: string } } | null>(null);
  const sourceToast = (message: string, type: 'converted' | 'generated' | 'warning') => {
      const n = sourceNoticeRef.current;
      if (n) showToast(n.text, 'converted', n.link);
      else showToast(message, type);
  };

  const normalizeCoords = (coords: number[]): number[] | null => {
      if (!Array.isArray(coords) || coords.length !== 5) return null;
      const [page, y1, x1, y2, x2] = coords;
      const norm = [page, Math.min(y1, y2), Math.min(x1, x2), Math.max(y1, y2), Math.max(x1, x2)];
      if (norm[3] <= norm[1]) norm[3] = norm[1] + 20;
      if (norm[4] <= norm[2]) norm[4] = norm[2] + 20;
      return norm;
  };

  // The section a field belongs to: marked when the field's own text cannot be found in the PDF.
  const highlightFallbackRef = useRef<number[] | null>(null);

  const handleTextNotFound = (partial: boolean) => {
      // A document entered by hand or opened from a file: nothing was derived by a model.
      const ai = isAiDocRef.current;
      if (partial) { sourceToast(ai ? DERIVED_FROM_TEXT_MESSAGE : PARTLY_FOUND_MESSAGE, 'generated'); return; }
      const box = highlightFallbackRef.current;
      if (box) {
          highlightFallbackRef.current = null;
          setHighlightData({ type: 'coords', value: box });
          sourceToast(ai ? DERIVED_FROM_AREA_MESSAGE : PARTLY_FOUND_MESSAGE, 'generated');
      } else {
          sourceToast(ai ? GENERATED_VALUE_MESSAGE : NOT_FOUND_MESSAGE, 'generated');
      }
  };

  // What the last "show in the PDF" was about, for the notice when the viewer finds it in another form.
  const conversionRef = useRef<{ value: string; kind?: SourceKind } | null>(null);

  // A country code is either the country's name converted (“Belgium” → BE) or derived from the address.
  const showCountryNotice = (code: string, found: string) => {
      const isName = !/\d/.test(found) && found.length > 2 && !(drmdData.administrativeData.producers || []).some(p => sameText(p.address.city, found));
      if (isName) sourceToast(`${CONVERTED_VALUE_PREFIX}: "${found}" → "${code}". ${conversionReason('country')}`, 'converted');
      else sourceToast(`"${code}" is not written in the PDF: the country was derived from the address marked here ("${found}"). ${conversionReason('country')} Please check it.`, 'generated');
  };

  const handleAlternativeFound = (found: string) => {
      const c = conversionRef.current;
      if (!c) return;
      if (c.kind === 'country') {
          showCountryNotice(c.value, found);
      } else if (c.kind === 'address') {
          sourceToast(`"${c.value}" is not written in the PDF: the model added it to the address marked here ("${found}"). Please check it.`, 'generated');
      } else {
          sourceToast(`${CONVERTED_VALUE_PREFIX}: "${found}" → "${c.value}". ${conversionReason(c.kind)}`, 'converted');
      }
  };

  const handleHighlight = (primaryTarget?: number[] | string | null, secondaryTarget?: number[] | string | null, textFallback?: string, originalText?: string,
                           opts?: { kind?: SourceKind; address?: { city?: string; postCode?: string }; name?: string; line?: string; notice?: { text: string; link?: { href: string; label: string } } }) => {
      setToastMessage(null);
      sourceNoticeRef.current = opts?.notice ?? null;
      highlightFallbackRef.current = Array.isArray(secondaryTarget) && secondaryTarget.length === 5 ? normalizeCoords(secondaryTarget) : null;
      const isTransformed = originalText && textFallback && originalText.trim().toLowerCase() !== textFallback.trim().toLowerCase();
      const value = (textFallback || '').trim();
      // Dates are recognised by their form; a country code is marked as such by its field.
      const kind = opts?.kind ?? (isIsoDate(value) ? 'date' : undefined);
      conversionRef.current = value ? { value, kind } : null;
      const converted = kind === 'date' || kind === 'country';
      const reason = converted ? ` ${conversionReason(kind)}` : '';
      const verbatim = !value || !pdfIndex || !pdfIndex.hasText || isInPdf(value, pdfIndex);

      if (Array.isArray(primaryTarget) && primaryTarget.length === 5) {
          const normalized = normalizeCoords(primaryTarget);
          if (normalized) {
              setHighlightData({ type: 'coords', value: normalized });
              if (isTransformed && kind === 'country') {
                  showCountryNotice(value, originalText!.trim());
              } else if (isTransformed) {
                  sourceToast(`${CONVERTED_VALUE_PREFIX}: "${originalText}" → "${textFallback}".${reason}`, 'converted');
              } else if (converted && !verbatim) {
                  sourceToast(`Written as "${value}" for the XML; the marked area is where it was taken from.${reason}`, 'converted');
              } else if (!verbatim) {
                  sourceToast(isAiDocRef.current ? DERIVED_FROM_AREA_MESSAGE : PARTLY_FOUND_MESSAGE, 'generated');
              }
              return;
          }
      }
      
      if (isTransformed) {
          setHighlightData({ type: 'text', value: originalText });
          if (kind === 'country') showCountryNotice(value, originalText!.trim());
          else sourceToast(`${CONVERTED_VALUE_PREFIX}: "${originalText}" → "${textFallback}".${reason}`, 'converted');
          return;
      }

      const textToSearch = typeof primaryTarget === 'string' && primaryTarget.trim().length > 0 ? primaryTarget : 
                           (typeof textFallback === 'string' && textFallback.trim().length > 0 ? textFallback : null);
                           
      if (textToSearch) {
          const alternatives = kind === 'date' ? dateForms(value) : kind === 'country' ? countryForms(value, opts?.address)
              : kind === 'address' ? addressForms(opts?.address, opts?.name, opts?.line) : undefined;
          setHighlightData({ type: 'text', value: textToSearch, alternatives });
          return;
      }

      if (Array.isArray(secondaryTarget) && secondaryTarget.length === 5) {
          const normalized = normalizeCoords(secondaryTarget);
          if (normalized) {
              setHighlightData({ type: 'coords', value: normalized });
              return;
          }
      }
      
      if (typeof secondaryTarget === 'string' && secondaryTarget.trim().length > 0) {
          setHighlightData({ type: 'text', value: secondaryTarget });
          return;
      }
      
      if (textFallback) {
          sourceToast(isAiDocRef.current ? GENERATED_VALUE_MESSAGE : NOT_FOUND_MESSAGE, 'generated');
      }
  };


  // ---- Identifier look-ups on request (magnifying-glass buttons next to ROR, CAS / InChIKey and table identifiers) ----
  // For forms filled in by hand, and to have the AI check identifiers again. A result is only applied
  // to the same document and the same name it was looked up for. When the check could be made, the
  // result replaces what the field held, and "nothing found" empties the field. When it could not be
  // made (service or AI not reachable), nothing is removed.
  const setLookup = (key: string, state: LookupState) => setLookups(prev => ({ ...prev, [key]: state }));
  const NEEDS_KEY = `Enter an API key for ${providerLabel} in AI settings first (or choose another AI provider there). The identifier check uses it.`;
  const NOT_COMPLETED = 'The look-up could not be completed. Check the internet connection and the API key, then try again.';
  const sameText = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

  const lookUpProducerRor = async (uuid: string) => {
      const key = `ror:${uuid}`;
      const prod = drmdRef.current.administrativeData.producers.find(p => p.uuid === uuid);
      if (!prod) return;
      const name = (prod.name || '').trim();
      if (!name) { setLookup(key, { busy: false, msg: 'Enter the name of the producer first. City and country make the match more reliable.', tone: 'warn' }); return; }
      if (!conn.apiKey) { setLookup(key, { busy: false, msg: NEEDS_KEY, tone: 'warn' }); return; }
      const city = prod.address?.city || '', country = prod.address?.countryCode || '';
      const runId = documentRunRef.current;
      setLookup(key, { busy: true, msg: 'Looking up the ROR ID…' });
      const { rorId, complete } = await lookUpRorAgain(name, city, country, conn);
      if (runId !== documentRunRef.current) return;
      const now = drmdRef.current.administrativeData.producers.find(p => p.uuid === uuid);
      if (!now || !sameText(now.name, name)) { setLookup(key, { busy: false, msg: 'The name was changed during the look-up. Please look it up again.', tone: 'warn' }); return; }
      if (!rorId && !complete) { setLookup(key, { busy: false, msg: NOT_COMPLETED, tone: 'warn' }); return; }
      if (!rorId) {
          setDrmdData(prev => ({ ...prev, administrativeData: { ...prev.administrativeData, producers: prev.administrativeData.producers.map(p => p.uuid !== uuid ? p : {
              ...p,
              organizationIdentifiers: [{ scheme: 'ROR', value: '', link: '' }, ...(p.organizationIdentifiers || []).filter(id => id.scheme !== 'ROR' && (id.value || '').trim())],
          }) } }));
          setLookup(key, { busy: false, msg: 'No matching organisation found in ROR, so the field was cleared. Check the name, city and country, or enter the ROR ID yourself.', tone: 'warn' });
          return;
      }
      setDrmdData(prev => ({ ...prev, administrativeData: { ...prev.administrativeData, producers: prev.administrativeData.producers.map(p => p.uuid !== uuid ? p : {
          ...p,
          organizationIdentifiers: [{ scheme: 'ROR', value: rorId, link: `https://ror.org/${rorId}` }, ...(p.organizationIdentifiers || []).filter(id => id.scheme !== 'ROR' && (id.value || '').trim())],
      }) } }));
      setLookup(key, { busy: false, msg: `Found ROR ID ${rorId}. Open it to confirm that it is the right organisation.`, tone: 'ok' });
  };

  const lookUpMaterialIds = async (uuid: string) => {
      const key = `mat:${uuid}`;
      const mat = drmdRef.current.materials.find(m => m.uuid === uuid);
      if (!mat) return;
      const name = (mat.name || '').trim();
      if (!name) { setLookup(key, { busy: false, msg: 'Enter the name of the material first.', tone: 'warn' }); return; }
      if (!conn.apiKey) { setLookup(key, { busy: false, msg: NEEDS_KEY, tone: 'warn' }); return; }
      const runId = documentRunRef.current;
      setLookup(key, { busy: true, msg: 'Looking up the CAS number and InChIKey…' });
      const { ids, complete } = await lookUpChemicalAgain(name, materialLookupContext(name, mat.description), conn);
      if (runId !== documentRunRef.current) return;
      const now = drmdRef.current.materials.find(m => m.uuid === uuid);
      if (!now || !sameText(now.name, name)) { setLookup(key, { busy: false, msg: 'The name was changed during the look-up. Please look it up again.', tone: 'warn' }); return; }
      if (!complete && ids.length === 0) { setLookup(key, { busy: false, msg: NOT_COMPLETED, tone: 'warn' }); return; }
      // Complete: the result replaces the CAS / InChIKey shown (none found → emptied).
      // Not complete: only fill in what was found, and keep the rest.
      setDrmdData(prev => ({ ...prev, materials: prev.materials.map(m => m.uuid !== uuid ? m : {
          ...m,
          materialIdentifiers: [...(m.materialIdentifiers || []).filter(mid => !isChemId(mid)), ...(complete ? ids : mergeLookedUp((m.materialIdentifiers || []).filter(isChemId), ids))],
          identifiersEdited: true,
      }) }));
      if (ids.length === 0) { setLookup(key, { busy: false, msg: `No CAS number or InChIKey found for "${name}", so the field was cleared. It may not be a single defined substance.`, tone: 'warn' }); return; }
      const foundText = `Found ${ids.map(id => `${id.scheme} ${id.value}`).join(' and ')}.`;
      setLookup(key, complete
          ? { busy: false, msg: foundText, tone: 'ok' }
          : { busy: false, msg: `${foundText} The look-up could not be completed, so other entries were kept. Try again later.`, tone: 'warn' });
  };

  const lookUpTableIds = async (resultUuid: string) => {
      const key = `tbl:${resultUuid}`;
      const res = drmdRef.current.properties.flatMap(p => p.results).find(r => r.uuid === resultUuid);
      if (!res) return;
      const rows = res.quantities.filter(q => (q.name || '').trim());
      if (rows.length === 0) { setLookup(key, { busy: false, msg: 'Enter the names of the rows first, for example the elements.', tone: 'warn' }); return; }
      if (!conn.apiKey) { setLookup(key, { busy: false, msg: NEEDS_KEY, tone: 'warn' }); return; }
      const runId = documentRunRef.current;
      setLookup(key, { busy: true, msg: `Looking up identifiers: 0 of ${rows.length}…` });
      const found = await lookUpChemicalsAgain(rows.map(q => q.name), conn, (done, total) => {
          if (runId === documentRunRef.current) setLookup(key, { busy: true, msg: `Looking up identifiers: ${done} of ${total}…` });
      });
      if (runId !== documentRunRef.current) return;
      setDrmdData(prev => ({ ...prev, properties: prev.properties.map(p => ({ ...p, results: p.results.map(r => r.uuid !== resultUuid ? r : {
          ...r,
          quantities: r.quantities.map(q => {
              const hit = found.get(chemKey(q.name));
              if (!hit || (!hit.complete && hit.ids.length === 0)) return q;
              // Complete: the result replaces the row's CAS / InChIKey (none found → emptied). Other schemes stay.
              const others = (q.identifiers || []).filter(id => !isChemId(id) && (id.value || '').trim());
              return { ...q, identifiers: hit.complete ? [...hit.ids, ...others] : mergeLookedUp(q.identifiers || [], hit.ids), identifiersEdited: true };
          }),
      }) })) }));
      const hitOf = (q: { name: string }) => found.get(chemKey(q.name));
      const withIds = rows.filter(q => (hitOf(q)?.ids.length || 0) > 0).length;
      const cleared = rows.filter(q => { const h = hitOf(q); return !!h && h.complete && h.ids.length === 0; }).length;
      const failed = rows.filter(q => { const h = hitOf(q); return !h || (!h.complete && h.ids.length === 0); }).length;
      const rows1 = (n: number) => n === 1 ? '1 row' : `${n} rows`;
      setLookup(key, {
          busy: false,
          msg: `Done: identifiers found for ${withIds} of ${rows.length} rows.`
              + (cleared ? ` No identifiers exist for ${rows1(cleared)}, so ${cleared === 1 ? 'its field was' : 'their fields were'} cleared.` : '')
              + (failed ? ` For ${rows1(failed)} the look-up could not be completed, so ${failed === 1 ? 'it keeps' : 'they keep'} what ${failed === 1 ? 'it' : 'they'} had. Try again later.` : ''),
          tone: withIds === 0 || failed ? 'warn' : 'ok',
      });
  };

  // Fills ROR / CAS / InChIKey identifiers into the document already on screen. Runs AFTER the form
  // is populated, so the user can start reviewing immediately; the merge only fills still-empty
  // identifier rows of that same document, so nothing the user typed meanwhile is overwritten.
  const enrichIdentifiersInBackground = (doc: DRMD, runId: number) => {
      const isCurrent = () => runId === documentRunRef.current;
      setIdentifierStatus("Looking up identifiers (ROR, CAS, InChIKey)…");
      resolveIdentifiers(doc, conn, {
          llmDeadlineMs: IDENTIFIER_LLM_DEADLINE_MS,
          onProgress: (done, total) => {
              if (isCurrent() && total > 0) setIdentifierStatus(`Looking up identifiers (ROR, CAS, InChIKey): ${done} of ${total}…`);
          },
          // A ROR ID appears as soon as it is found, without waiting for the other look-ups.
          onPartial: (part) => { if (isCurrent()) setDrmdData(prev => applyIdentifierPatch(prev, part)); },
      })
          .then(patch => { if (isCurrent()) setDrmdData(prev => applyIdentifierPatch(prev, patch)); })
          .catch(err => console.warn("Identifier look-up failed:", err))
          .finally(() => { if (isCurrent()) setIdentifierStatus(null); });
      // Units the rules of the D-SI guide could not write on their own: the AI reads their context,
      // and the rules check its answers. Nothing changes where the rules already wrote the unit.
      if (needsUnitAi(doc)) {
          unitRunRef.current = runId;
          setUnitStatus("Checking units (D-SI)…");
          refineUnitsWithAi(doc, conn, { doc: pdfName || undefined })
              .then(patch => { if (isCurrent()) setDrmdData(prev => applyUnitPatch(prev, patch)); })
              .catch(err => console.warn("D-SI unit check failed:", err))
              .finally(() => { if (unitRunRef.current === runId) setUnitStatus(null); });
      }
  };
  const unitRunRef = useRef(0);

  // A unit typed in the form that the rules cannot write in D-SI: after a short pause, the AI is asked
  // with the row's context, and its answer is used only if the rules confirm it.
  const unitAiTimers = useRef(new Map<string, number>());
  const cancelUnitAi = (uuid: string) => {
      const t = unitAiTimers.current.get(uuid);
      if (t !== undefined) { clearTimeout(t); unitAiTimers.current.delete(uuid); }
  };
  const scheduleUnitAi = (uuid: string) => {
      cancelUnitAi(uuid);
      if (!connRef.current.apiKey) return;
      unitAiTimers.current.set(uuid, window.setTimeout(async () => {
          unitAiTimers.current.delete(uuid);
          // (Also while other AI work runs: the settings are locked then, so this request goes to the same model.)
          if (!connRef.current.apiKey) return;
          const runId = documentRunRef.current;
          setUnitBusy(b => ({ ...b, [uuid]: true }));
          try {
              const patch = await refineUnitsWithAi(drmdDataRef.current, connRef.current, { only: [uuid] });
              if (runId === documentRunRef.current) setDrmdData(prev => applyUnitPatch(prev, patch));
          } catch (err) {
              console.warn("D-SI unit check failed:", err);
          } finally {
              setUnitBusy(b => { const n = { ...b }; delete n[uuid]; return n; });
          }
      }, 1500));
  };

  // Clicking a D-SI unit: the unit it was written from is marked in the PDF, and a notice says how it
  // was written in D-SI, its quality class with the rules, and cites the D-SI guide. (The D-SI form is
  // never in the PDF word for word, so the notice always explains it.)
  // The link opens the D-SI guide (Zenodo) at the page of the rule that decided the unit.
  const dsiGuideLink = (page?: number) => ({
      href: page ? guidePageUrl(page) : 'https://zenodo.org/records/3816686',
      label: `D-SI guide v1.3 (SmartCom)${page ? `, p. ${page}` : ''}, DOI 10.5281/zenodo.3816686`,
  });
  const showDsiSource = (q: Quantity, res: MeasurementResult, prop: MaterialProperty) => {
      const unit = String(q.unit ?? '').trim();
      const dsi = String(q.dsiUnit ?? '').trim();
      const value = String(q.value ?? '').trim();
      const shownUnit = unit && unit !== '\\one' ? `"${unit}"` : 'one (no unit)';
      const ctx = { texts: unitContextTexts(q as any, res, prop, drmdData.statements?.official?.metrologicalTraceability) };
      let text: string;
      let page: number | undefined;
      if (dsi) {
          const c = checkDsi(dsi);
          if (!c.ok) {
              text = `"${dsi}" is not a valid D-SI unit: ${issuesText(c.errors)} Correct it, or change the unit to have it written again.`;
              page = c.errors[0]?.page;
          } else {
              const how = q.dsiSource === 'manual' ? 'as typed in the form'
                  : q.dsiSource === 'ai' ? `by the AI from the context of the table and property set, and confirmed by the rules of the D-SI guide${q.dsiNote ? ` (${q.dsiNote.replace(/\.$/, '')})` : ''}`
                  : 'by the rules of the D-SI guide';
              const mismatch = q.dsiSource === 'manual' && unit && parseHumanUnit(unit) && !isKindDependent(unit) && !verifySameUnit(unit, dsi).ok;
              // The rules' own explanation, when they wrote this unit (it names notes such as "dry mass")
              const rules = unit ? dsiFor(unit, ctx) : null;
              const why = rules && rules.dsi === dsi ? rules.explanation : explainDsi(c);
              text = `Converted for the XML: the unit ${shownUnit} marked here is written in D-SI as ${dsi}, ${how}. ${why}${value ? ` The value ${value} stays exactly as it is.` : ''}`
                  + (mismatch ? ` Note: ${dsi} is not the same size as "${unit}"; check it.` : '');
              page = DSI_CLASS_PAGE[c.cls];
          }
      } else if (unit) {
          const r = dsiFor(unit, ctx);
          text = `The unit ${shownUnit} marked here is written to the XML as typed: ${r.explanation} The value is not converted. A D-SI unit can be typed in this field.`;
          page = r.page ?? DSI_CLASS_PAGE.improvable;
      } else {
          text = 'This row has no unit; it is written with \\one (a quantity of dimension one, Table A.2, D-SI guide p. 48).';
          page = 48;
      }
      const link = dsiGuideLink(page);
      const notice = { text, link };
      handleHighlight(q.fieldCoordinates?.unit, res.sectionCoordinates, unit && unit !== '\\one' ? unit : res.name, undefined, { notice });
      showToast(text, 'converted', link);
  };

  // ---- A PDF or folder chosen before an API key was entered ----
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const pendingUploadRef = useRef(pendingUpload);
  pendingUploadRef.current = pendingUpload;

  // Keeps the upload until a key is entered; a PDF is shown meanwhile. Settings opens for the key.
  const holdUntilKey = (next: { kind: 'pdf'; file: File } | { kind: 'bulk'; picked: PickedPdf[]; folderName: string | null; label: string }) => {
      const prev = pendingUploadRef.current;
      // What the viewer showed before the first waiting upload, for "Cancel".
      const restore: PaneRestore = prev ? prev.restore : { url: pdfUrl, name: pdfName, rmData: shownRmDataRef.current };
      if (prev?.kind === 'pdf') revokeLater(prev.previewUrl);
      let pending: PendingUpload;
      if (next.kind === 'pdf') {
          const previewUrl = URL.createObjectURL(next.file);
          setPdfUrl(previewUrl);
          setPdfName(next.file.name);
          shownRmDataRef.current = null;
          pending = { ...next, previewUrl, restore };
      } else {
          setPdfUrl(restore.url);
          setPdfName(restore.name);
          shownRmDataRef.current = restore.rmData;
          pending = { ...next, restore };
      }
      pendingUploadRef.current = pending;
      setPendingUpload(pending);
      setError(null);
      setActiveTab("settings");
  };

  // Another document takes over (new upload, XML, a folder row): the waiting upload is dropped.
  const dropPendingUpload = () => {
      if (!pendingUploadRef.current) return;
      pendingUploadRef.current = null;
      setPendingUpload(null);
  };

  const cancelPendingUpload = () => {
      const p = pendingUploadRef.current;
      if (!p) return;
      dropPendingUpload();
      setPdfUrl(p.restore.url);
      setPdfName(p.restore.name);
      shownRmDataRef.current = p.restore.rmData;
      if (p.kind === 'pdf') revokeLater(p.previewUrl);
  };

  const startPendingUpload = () => {
      const p = pendingUploadRef.current;
      if (!p || !conn.apiKey || isProcessing || bulkProcessing) return;
      dropPendingUpload();
      if (p.kind === 'pdf') processPdfFile(p.file, p.previewUrl);
      else void startBulk(p.picked, p.folderName);
  };

  // As soon as a key is there, it is checked with the provider (as "Check key" does), after a short
  // pause so that a key being typed is not checked half-finished. The upload starts when the key
  // works; a key that is not accepted is shown, and checked again when it is changed.
  const activeCheck = providerChecks[activeProvider];
  useEffect(() => {
      if (!pendingUpload || !conn.apiKey || isProcessing || bulkProcessing) return;
      if (activeCheck?.ok && (activeCheck.models?.length ?? 0) > 0) { startPendingUpload(); return; }
      if (activeCheck || conn.apiKey.length < 20) return;
      const timer = setTimeout(() => { void checkProviderKey(activeProvider); }, 1200);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUpload, conn.apiKey, activeProvider, activeCheck, isProcessing, bulkProcessing]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Clear the input so picking the SAME file again still fires onChange
      // (otherwise a re-upload after a failed run looks like nothing happened).
      event.target.value = '';
      if (file) acceptPdfFile(file);
  };

  /** A PDF that was picked or dropped: checked, then extracted (or kept until an API key is entered). */
  const acceptPdfFile = (file: File) => {
      // Validation: Size (20MB)
      if (file.size > 20 * 1024 * 1024) {
          setError(`File ${file.name} exceeds the 20MB limit.`);
          return;
      }
      // Validation: Type (PDF)
      const validTypes = ['application/pdf'];
      const validExts = ['.pdf'];
      const isValid = validTypes.includes(file.type) || validExts.some(ext => file.name.toLowerCase().endsWith(ext));
      if (!isValid) {
          setError(`File ${file.name} is not a valid PDF document.`);
          return;
      }
      if (!conn.apiKey) { holdUntilKey({ kind: 'pdf', file }); return; }
      processPdfFile(file);
  };

  // ---- Drag and drop onto the certificate pane ----
  const [dropActive, setDropActive] = useState(false);
  // A folder dropped in Chrome / Edge: the user chooses whether its results are saved into it.
  const [droppedFolder, setDroppedFolder] = useState<{ root: FileSystemDirectoryHandle; picked: PickedPdf[] } | null>(null);

  const isFileDrag = (e: React.DragEvent | DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleDragOver = (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = (isProcessing || bulkProcessing) ? 'none' : 'copy';
      if (!dropActive) setDropActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      // Moving between the pane's own children also fires dragleave: only leaving the pane counts.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDropActive(false);
      if (isProcessing || bulkProcessing) {
          setError('A certificate is being processed. Drop the files again when it has finished.');
          return;
      }
      // Everything is taken from the drop now: the browser empties it once this handler returns.
      const items = Array.from(e.dataTransfer.items || []).filter(it => it.kind === 'file');
      const dropped = items.map(it => ({
          handle: typeof (it as any).getAsFileSystemHandle === 'function' ? ((it as any).getAsFileSystemHandle() as Promise<any>).catch(() => null) : Promise.resolve(null),
          entry: typeof (it as any).webkitGetAsEntry === 'function' ? (it as any).webkitGetAsEntry() : null,
          file: it.getAsFile(),
      }));
      // Browsers without the item list: the plain file list (files only, no folders).
      if (dropped.length === 0) Array.from(e.dataTransfer.files || []).forEach(file => dropped.push({ handle: Promise.resolve(null), entry: null, file }));
      void acceptDrop(dropped);
  };

  const acceptDrop = async (dropped: { handle: Promise<any>; entry: any; file: File | null }[]) => {
      if (dropped.length === 0) return;
      setError(null);
      try {
          // One folder, in a browser that can save into folders: ask where its results go.
          if (dropped.length === 1 && canWriteFolders && !folderWriteBlockedRef.current) {
              const handle = await dropped[0].handle;
              if (handle?.kind === 'directory') {
                  setStatusMessage(`Reading ${handle.name}…`);
                  const picked = (await scanFolderForPdfs(handle)).sort(byPath);
                  if (picked.length === 0) { setError(`There are no PDF files in ${handle.name}.`); return; }
                  setDroppedFolder({ root: handle, picked });
                  return;
              }
          }
          // Anything else: the PDFs among the dropped files and folders. Their results stay in the tab.
          const picked: PickedPdf[] = [];
          let folders = 0, others = 0;
          for (const d of dropped) {
              if (d.entry?.isDirectory) {
                  folders++;
                  picked.push(...await readDroppedFolder(d.entry, dropped.length === 1 ? '' : `${d.entry.name}/`));
              } else if (d.file && /\.pdf$/i.test(d.file.name)) {
                  picked.push({ file: d.file, path: d.file.name });
              } else others++;
          }
          if (picked.length === 0) {
              setError(folders > 0 ? 'There are no PDF files in the dropped folder.'
                  : 'Only PDF files and folders can be dropped here. To open a DRMD XML file, use “Open XML”.');
              return;
          }
          if (picked.length === 1 && folders === 0) { acceptPdfFile(picked[0].file); return; }
          picked.sort(byPath);
          const label = folders === 1 && dropped.length === 1 ? dropped[0].entry.name : `${picked.length} PDFs`;
          await runOrHoldBulk(picked, null, label);
          if (others > 0) setError(`${others} dropped file${others === 1 ? ' is' : 's are'} not a PDF and ${others === 1 ? 'was' : 'were'} left out.`);
      } catch (err: any) {
          setError(`Could not read the dropped files: ${err?.message || err}`);
      } finally {
          setStatusMessage("");
      }
  };

  // The dropped folder's results are saved into it (the browser asks for permission first), or kept in the tab.
  const runDroppedFolder = async (saveIntoFolder: boolean): Promise<string | null> => {
      const dropped = droppedFolder;
      if (!dropped) return null;
      if (saveIntoFolder) {
          let permission = 'denied';
          try { permission = await (dropped.root as any).requestPermission({ mode: 'readwrite' }); } catch { /* not allowed */ }
          if (permission !== 'granted') {
              return 'The browser did not allow saving into this folder. Choose “Keep results in this tab”, or try again and choose “Allow”.';
          }
          setDroppedFolder(null);
          await runOrHoldBulk(dropped.picked, dropped.root.name, dropped.root.name);
      } else {
          setDroppedFolder(null);
          // In the tab every PDF is converted, also those with an XML beside them.
          await runOrHoldBulk(dropped.picked.map(({ file, path }) => ({ file, path })), null, dropped.root.name);
      }
      return null;
  };

  // A file dropped anywhere else on the page would make the browser open it in place of the
  // generator, and everything in the form would be gone.
  useEffect(() => {
      const guard = (e: DragEvent) => {
          if (e.defaultPrevented || !isFileDrag(e)) return; // the certificate pane takes it
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
          if (e.type === 'drop') setDropActive(false);
      };
      const end = () => setDropActive(false);
      window.addEventListener('dragover', guard);
      window.addEventListener('drop', guard);
      window.addEventListener('dragend', end);
      return () => {
          window.removeEventListener('dragover', guard);
          window.removeEventListener('drop', guard);
          window.removeEventListener('dragend', end);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Extracts one certificate. `shownUrl`: the PDF is already in the viewer (it waited for a key). */
  const processPdfFile = (file: File, shownUrl?: string) => {
      dropPendingUpload();
      flushPendingSave();
      const runId = ++documentRunRef.current;
      const isCurrent = () => runId === documentRunRef.current;
      clearQuotaMemory(conn.apiKey); // user-started run: re-check limits with the provider
      const objectUrl = shownUrl || URL.createObjectURL(file);
      setPdfUrl(objectUrl);
      setPdfName(file.name);
      shownRmDataRef.current = null; // the PDF being extracted, not yet part of the document
      setReviewingBulkId(null);
      setError(null);
      setIdentifierStatus(null);
      setExtractionWarning(null);
      setIsProcessing(true);
      // Reset bulk results when starting a single upload
      setBulkResults([]);
      setBulkProcessing(false);

      const reader = new FileReader();
      reader.onerror = () => {
          if (!isCurrent()) return;
          setError(`Could not read ${file.name}: ${reader.error?.message || 'file read failed'}.`);
          setIsProcessing(false);
          setStatusMessage("");
      };
      reader.onload = async () => {
          let mapped: DRMD | null = null;
          try {
              // Decoding happens inside the try: a null or malformed result used to throw here
              // and leave the "Processing Document..." overlay spinning with no error shown.
              const base64String = reader.result as string | null;
              const base64Content = base64String?.split(',')[1];
              if (!base64Content) throw new Error(`Could not read ${file.name} — the file appears to be empty or corrupted.`);

              setStatusMessage(`Sending the certificate to ${providerLabel} and waiting for the extracted data…`);
              // The certificate's own text, read meanwhile, to check the producer's country (see mapExtractedToDrmd).
              const pdfTextPromise = pdfPlainText(base64Content);
              let report: ExtractionReport | null = null;
              const extractedData = await extractStructuredDataFromPdf(base64Content, file.type || 'application/pdf', conn, undefined, (msg) => { if (isCurrent()) setStatusMessage(msg); }, { onReport: (r) => { report = r; }, docName: file.name });
              if (!isCurrent()) return; // another document has taken over the form meanwhile
              const rep = report as ExtractionReport | null;
              if (rep && !rep.complete) {
                  setExtractionWarning(
                      `The AI's answer was incomplete even after ${rep.passes} attempts — missing: ${rep.missing.join(', ')}. ` +
                      `The form shows the most complete answer. Upload the PDF again to retry, or fill in the missing parts.`
                  );
              }
              // Put the extracted data on screen NOW. This used to wait for every ROR / CAS
              // look-up (about one extra Gemini request per element) to finish first, which is
              // why a finished extraction could sit behind a spinner and a blank form.
              mapped = finishExtractedDoc(mapExtractedToDrmd(extractedData, file.name, base64Content, await pdfTextPromise));
              // The PDF in the pane is now the document's human-readable PDF, and the AI filled in its values.
              shownRmDataRef.current = (mapped.binaryDocuments || []).find(d => d.rmDocument)?.data || null;
              rememberAiValues(takeOverDoc('ai'), mapped);
              setDrmdData(mapped);
              setActiveTab("admin");
            } catch (err) {
              if (isCurrent()) setError(err instanceof Error ? err.message : "Extraction failed.");
              console.error(err);
            } finally {
              if (isCurrent()) {
                  setIsProcessing(false);
                  setStatusMessage("");
              }
            }
          if (mapped && isCurrent()) enrichIdentifiersInBackground(mapped, runId);
      };
      reader.readAsDataURL(file);
  };

  // Helper: read a File as base64 data URL
  const readFileAsBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
              const base64 = (reader.result as string | null)?.split(',')[1];
              if (!base64) reject(new Error(`Could not read ${file.name} — the file appears to be empty or corrupted.`));
              else resolve(base64);
          };
          reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
          reader.readAsDataURL(file);
      });
  };

  // Helper: extract RM code and name from DRMD
  const extractRmInfo = (drmd: any): { rmCode: string; rmName: string } => {
      let rmCode = "";
      let rmName = "";
      if (drmd.materials.length > 0) {
          const mat = drmd.materials[0];
          rmName = mat.name || "";
          rmCode = mat.rmCode || "";
          if (!rmCode) {
              const id = mat.materialIdentifiers?.find((i: any) => i.scheme && i.value);
              if (id) {
                  rmCode = `${id.scheme}-${id.value}`;
              }
          }
          if (!rmCode) rmCode = rmName;
      }
      if (!rmCode) rmCode = drmd.administrativeData.uniqueIdentifier || "Unknown";
      return { rmCode: sanitizeFilename(rmCode) || "Unknown", rmName };
  };

  type BulkItem = { id: string; file: File };

  // Runs a list of bulk rows one after another. Used for the initial folder upload and for
  // "Retry failed", so both get exactly the same pacing, retries and identifier handling.
  const processBulkQueue = async (items: BulkItem[]) => {
      bulkCancelRef.current = false;
      clearQuotaMemory(conn.apiKey); // user-started run: re-check limits with the provider
      setBulkProcessing(true);
      setBulkProgress({ current: 0, total: items.length, currentFile: '' });

      const setRow = (id: string, changes: Partial<BulkResult>) =>
          setBulkResults(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r));

      // The paced waits below are long enough that an uninterruptible sleep would make
      // "Cancel Remaining" look broken, so poll the cancel flag while waiting.
      const pacedWait = async (totalMs: number) => {
          const step = 500;
          for (let waited = 0; waited < totalMs; waited += step) {
              if (bulkCancelRef.current) return;
              await sleep(Math.min(step, totalMs - waited));
          }
      };

      // Set when the DAILY quota is gone for every model: nothing more can succeed today.
      let stopReason: string | null = null;

      // Process sequentially (one at a time for RPM limits)
      for (let i = 0; i < items.length; i++) {
          if (bulkCancelRef.current) break;

          const { id, file } = items[i];
          const prefix = `[${i + 1}/${items.length}] ${file.name}`;
          setBulkProgress({ current: i + 1, total: items.length, currentFile: file.name });

          // Per-file size guard
          if (file.size > 20 * 1024 * 1024) {
              setRow(id, {
                  status: 'error',
                  errorMessage: `File exceeds the 20MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB).`
              });
              continue;
          }

          // Mark as processing
          setRow(id, { status: 'processing', errorMessage: undefined });

          let succeeded = false;
          let lastError: unknown = null;

          // Each document gets more than one shot. A single transient failure (rate limit,
          // overloaded model, a truncated answer) should not be the final word on a certificate.
          for (let attempt = 1; attempt <= BULK_ATTEMPTS_PER_FILE && !succeeded; attempt++) {
              if (bulkCancelRef.current) break;

              try {
                  const base64Content = await readFileAsBase64(file);
                  const pdfTextPromise = pdfPlainText(base64Content);
                  let report: ExtractionReport | null = null;
                  const extractedData = await extractStructuredDataFromPdf(
                      base64Content,
                      file.type || 'application/pdf',
                      conn,
                      undefined,
                      (msg) => setStatusMessage(`${prefix}${attempt > 1 ? ` (attempt ${attempt})` : ''}: ${msg}`),
                      // Let the model take as long as it needs, and wait out rate limits instead
                      // of giving up on the document.
                      { patient: true, onReport: (r) => { report = r; }, docName: file.name }
                  );
                  const extraction = report as ExtractionReport | null;

                  // No emptiness check here on purpose: extractStructuredDataFromPdf now counts
                  // the actual extracted values and throws if the answer carries no content, so
                  // both the single and bulk paths share one definition of "nothing was extracted".
                  const mapped = finishExtractedDoc(mapExtractedToDrmd(extractedData, file.name, base64Content, await pdfTextPromise));

                  // Identifier look-ups. Results are cached across the folder (same producer, same
                  // elements), they step aside the moment the quota gets tight (falling back to the
                  // PubChem / ROR data), and they have a time budget — so they can no longer starve
                  // the next certificate's extraction or stall the queue.
                  // A failed look-up must never cost the extraction: keep the document without
                  // those identifiers rather than failing (and re-extracting) the certificate.
                  let finalDoc = mapped;
                  try {
                      const patch = await resolveIdentifiers(mapped, conn, {
                          llmDeadlineMs: IDENTIFIER_LLM_DEADLINE_MS,
                          onProgress: (done, total) => {
                              if (total > 0) setStatusMessage(`${prefix}: data extracted — looking up identifiers ${done}/${total}…`);
                          },
                      });
                      finalDoc = applyIdentifierPatch(mapped, patch);
                  } catch (lookupErr) {
                      console.warn(`Identifier look-up failed for ${file.name}; saving without CAS / ROR identifiers.`, lookupErr);
                  }
                  // Units the rules could not write in D-SI: asked of the AI with their context, checked by the rules
                  try {
                      if (needsUnitAi(finalDoc)) {
                          setStatusMessage(`${prefix}: checking units (D-SI)…`);
                          finalDoc = applyUnitPatch(finalDoc, await refineUnitsWithAi(finalDoc, conn, { patient: true, doc: file.name }));
                      }
                  } catch (unitErr) {
                      console.warn(`D-SI unit check failed for ${file.name}; the rules' units are kept.`, unitErr);
                  }

                  // Build the XML once now so a broken document fails (and is retried) here rather
                  // than at download time. It is not stored: each XML embeds the PDF, and keeping
                  // 100 of them in memory next to the documents themselves doubles the footprint.
                  const xml = generateDrmdXml(finalDoc);
                  const { rmCode, rmName } = extractRmInfo(finalDoc);
                  // Same check as the Validate & Export tab: schema constraints + official business rules.
                  const validation = validateDrmd(finalDoc);

                  // Folder run: write the XML and the HTML report next to the PDF now, so the
                  // result is safe on disk and nothing has to stay in the tab.
                  let savedAs: string | undefined;
                  let saveError: string | undefined;
                  const dir = bulkDirsRef.current.get(id);
                  if (dir) {
                      setStatusMessage(`${prefix}: saving the XML and HTML report into the folder…`);
                      try {
                          savedAs = await saveResultFiles(dir, file.name, finalDoc, xml);
                      } catch (err) {
                          saveError = err instanceof Error ? err.message : String(err);
                          console.error(`Could not save the results of ${file.name}:`, err);
                      }
                  }

                  // The AI filled in this row's values: they are marked for checking when it is reviewed.
                  rememberAiValues(`row:${id}`, finalDoc);
                  checkedRef.current.delete(`row:${id}`);
                  setRow(id, {
                      savedAs,
                      saveError,
                      status: 'done',
                      rmCode,
                      rmName,
                      xmlContent: "",  // Generated on demand (see getBulkXml) to prevent OOM crashes
                      htmlContent: "", // Generated on-the-fly to prevent OOM crashes
                      drmdData: withoutSourcePdf(finalDoc, file.name),
                      errorMessage: undefined,
                      // The AI's answer still lacked essentials after re-asking: shown as
                      // "Incomplete" (not "Done") and picked up by "Retry failed / incomplete".
                      incomplete: extraction && !extraction.complete ? extraction.missing : undefined,
                      validation: {
                          errors: validation.errors.length,
                          conditionalErrors: validation.conditionalErrors.length,
                          warnings: validation.warnings.length,
                      },
                  });
                  succeeded = true;
              } catch (err) {
                  lastError = err;
                  console.error(`Error processing ${file.name} (attempt ${attempt}/${BULK_ATTEMPTS_PER_FILE}):`, err);

                  // Out of DAILY quota on every model: retrying this file, or moving on to the
                  // next, only re-discovers that — at up to ~25 minutes per document. Stop.
                  if ((err as any)?.isQuotaExhausted && (err as any)?.daily) {
                      stopReason = err instanceof Error ? err.message : `The ${providerLabel} quota or credit is used up.`;
                      break;
                  }

                  if (attempt < BULK_ATTEMPTS_PER_FILE && !bulkCancelRef.current) {
                      setStatusMessage(
                          `${prefix}: attempt ${attempt} failed. ` +
                          `Waiting ${Math.round(BULK_RETRY_COOLDOWN_MS / 1000)}s before retrying…`
                      );
                      await pacedWait(BULK_RETRY_COOLDOWN_MS);
                  }
              }
          }

          if (!succeeded) {
              if (bulkCancelRef.current && !stopReason) {
                  // Cancelled mid-document: leave it queued for "Retry", not stuck on "Extracting".
                  setRow(id, { status: 'pending' });
              } else {
                  setRow(id, {
                      status: 'error',
                      errorMessage: lastError instanceof Error ? lastError.message : "Extraction failed"
                  });
              }
              // Continue to next file — don't break
          }

          if (stopReason) {
              const remaining = new Set(items.slice(i + 1).map(it => it.id));
              const note = `Not processed — the ${providerLabel} quota or credit ran out. Use "Retry failed" after it resets or after adding credit.`;
              setBulkResults(prev => prev.map(r => remaining.has(r.id) ? { ...r, status: 'error', errorMessage: note } : r));
              setError(`Bulk run stopped: ${stopReason}`);
              break;
          }

          // Pace the run: pause before starting the next document so a per-minute quota has
          // room to refill. Skipped after the last file, and when the user has cancelled.
          const isLastFile = i === items.length - 1;
          if (!isLastFile && !bulkCancelRef.current) {
              setStatusMessage(`Pausing ${Math.round(BULK_COOLDOWN_MS / 1000)}s before the next document…`);
              await pacedWait(BULK_COOLDOWN_MS);
          }
      }

      setStatusMessage("");
      setBulkProcessing(false);
      setBulkProgress({ current: items.length, total: items.length, currentFile: '' });
  };

  // Starts a bulk run. `folderName` is set when results are saved into the picked folder.
  const startBulk = async (picked: PickedPdf[], folderName: string | null) => {
      dropPendingUpload();
      flushPendingSave();
      documentRunRef.current++;
      setIdentifierStatus(null);
      setExtractionWarning(null);
      setPdfUrl(null);
      setPdfName("");
      shownRmDataRef.current = null;
      setReviewingBulkId(null);
      setReviewSave({ state: 'idle' });
      // A new folder run: what was kept for the rows of an earlier run is dropped.
      for (const map of [aiValuesRef.current, checkedRef.current]) {
          for (const key of [...map.keys()]) if (key.startsWith('row:')) map.delete(key);
      }
      takeOverDoc('new');
      const blank = createInitialDrmd();
      blankDocRef.current = blank;
      setDrmdData(blank);
      setError(null);
      setActiveTab("validate-export");
      setBulkFolderName(folderName);

      const items = picked.map(p => ({ ...p, id: generateUUID() }));
      bulkFilesRef.current = new Map(items.map(it => [it.id, it.file]));
      bulkDirsRef.current = new Map(items.filter(it => it.dir).map(it => [it.id, it.dir as FileSystemDirectoryHandle]));

      setBulkResults(items.map(({ id, file, path, hasXml }) => ({
          id,
          fileName: file.name,
          filePath: path,
          rmCode: "",
          rmName: "",
          status: hasXml ? 'done' as const : 'pending' as const,
          savedEarlier: hasXml || undefined,
          savedAs: hasXml ? `${outputBaseName(file.name)}.xml` : undefined,
          xmlContent: "",
          htmlContent: "",
          drmdData: createInitialDrmd()
      })));

      const todo: BulkItem[] = items.filter(it => !it.hasXml).map(({ id, file }) => ({ id, file }));
      if (todo.length > 0) await processBulkQueue(todo);
  };

  // "Open folder": in Chrome / Edge the folder is opened with permission to save into it. The first
  // time, a short note explains what will be saved, so the browser's "edit files" prompt that follows
  // is expected.
  // Without an API key the folder can still be chosen: it waits until a key is entered.
  const handleOpenFolder = async () => {
      if (!canWriteFolders || folderWriteBlockedRef.current) { bulkFolderInputRef.current?.click(); return; }
      if (!folderIntroSeenRef.current) { setFolderIntroOpen(true); return; }
      await pickFolderAndRun();
  };

  const pickFolderAndRun = async () => {
      let root: FileSystemDirectoryHandle;
      try {
          root = await (window as any).showDirectoryPicker({ id: 'drmd-certificates', mode: 'readwrite' });
      } catch (err: any) {
          if (err?.name === 'AbortError') return; // picker closed
          console.error('Folder picker failed:', err);
          if (err?.name === 'NotAllowedError') {
              setError('To save the converted XML and HTML files into the folder, the generator needs your OK. Upload the folder again and choose "Allow" when the browser asks.');
          } else {
              // The browser does not offer folder access to this page: keep results in the tab instead.
              folderWriteBlockedRef.current = true;
              setError('This browser does not let the page save into folders. Click Upload folder again: the results will be kept in this tab and can be downloaded as a ZIP.');
          }
          return;
      }
      let picked: PickedPdf[];
      try {
          setStatusMessage(`Reading ${root.name}…`);
          picked = await scanFolderForPdfs(root);
      } catch (err: any) {
          setError(`Could not read the folder ${root.name}: ${err?.message || err}`);
          return;
      } finally {
          setStatusMessage("");
      }
      if (picked.length === 0) {
          setError(`There are no PDF files in ${root.name}.`);
          return;
      }
      picked.sort(byPath);
      await runOrHoldBulk(picked, root.name, root.name);
  };

  // Starts a folder run, or keeps it until an API key is entered. A folder whose PDFs all have their
  // XML already needs no key: it only lists the results.
  const runOrHoldBulk = async (picked: PickedPdf[], folderName: string | null, label: string) => {
      if (!conn.apiKey && picked.some(p => !p.hasXml)) { holdUntilKey({ kind: 'bulk', picked, folderName, label }); return; }
      await startBulk(picked, folderName);
  };

  // Fallback for browsers that cannot write into folders: results stay in the tab.
  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      // Filter to PDF files only (copied out of the FileList before the input is reset)
      const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      // Reset file input so same folder can be re-selected
      event.target.value = "";
      if (pdfFiles.length === 0) {
          setError("No PDF files found in the selected folder.");
          return;
      }
      const folder = (pdfFiles[0] as any).webkitRelativePath?.split('/')[0] || '';
      const picked = pdfFiles.map(file => ({ file, path: (file as any).webkitRelativePath?.split('/').slice(1).join('/') || file.name }));
      await runOrHoldBulk(picked, null, folder || `${picked.length} PDFs`);
  };

  // Re-runs only the rows that failed or were never reached (cancelled / quota stop).
  const handleBulkRetryFailed = async () => {
      if (!conn.apiKey) {
          setError(`Enter an API key for ${providerLabel} in AI settings first (or choose another AI provider there), then try again.`);
          setActiveTab("settings");
          return;
      }
      const items: BulkItem[] = bulkResults
          .filter(r => r.status === 'error' || r.status === 'pending' || (r.status === 'done' && !r.savedEarlier && !!r.incomplete?.length))
          .map(r => ({ id: r.id, file: bulkFilesRef.current.get(r.id) }))
          .filter((it): it is BulkItem => !!it.file);
      if (items.length === 0) return;
      const ids = new Set(items.map(it => it.id));
      if (reviewingBulkId && ids.has(reviewingBulkId)) { flushPendingSave(); setReviewingBulkId(null); }
      setError(null);
      setBulkResults(prev => prev.map(r => ids.has(r.id) ? { ...r, status: 'pending', errorMessage: undefined, incomplete: undefined } : r));
      await processBulkQueue(items);
  };

  // A bulk row's document with its source PDF read back from the file (rows keep it light).
  const hydrateBulkDoc = async (result: BulkResult): Promise<DRMD> => {
      const doc = result.drmdData;
      const docs = doc.binaryDocuments || [];
      if (!docs.some(d => !d.data)) return doc;
      const file = bulkFilesRef.current.get(result.id);
      if (!file) return { ...doc, binaryDocuments: docs.filter(d => d.data) };
      const data = await readFileAsBase64(file);
      return { ...doc, binaryDocuments: docs.map(d => d.data ? d : { ...d, data }) };
  };

  // XML for a bulk row, built on demand from its document (see processBulkQueue).
  const getBulkXml = async (result: BulkResult) => result.xmlContent || generateDrmdXml(await hydrateBulkDoc(result));

  const handleBulkReview = async (result: BulkResult, opts?: { tab?: string }) => {
      // Load this certificate into the main UI for review
      dropPendingUpload();
      flushPendingSave();
      const runId = ++documentRunRef.current;
      let doc: DRMD;
      try {
          if (result.savedEarlier && !result.loaded) {
              // Extracted in an earlier run: read the XML that sits next to the PDF.
              const dir = bulkDirsRef.current.get(result.id);
              if (!dir || !result.savedAs) throw new Error('the folder is no longer available');
              const xmlText = await (await (await dir.getFileHandle(result.savedAs)).getFile()).text();
              doc = normalizeMaterialLinks(parseDrmdXml(xmlText));
              // Written by an earlier folder run of the generator: its values were filled in by the AI.
              if (!aiValuesRef.current.has(`row:${result.id}`)) rememberAiValues(`row:${result.id}`, doc);
              const v = validateDrmd(doc);
              const { rmCode, rmName } = extractRmInfo(doc);
              setBulkResults(prev => prev.map(r => r.id === result.id ? {
                  ...r, loaded: true, rmCode, rmName, drmdData: withoutSourcePdf(doc, result.fileName),
                  validation: { errors: v.errors.length, conditionalErrors: v.conditionalErrors.length, warnings: v.warnings.length },
              } : r));
          } else {
              doc = await hydrateBulkDoc(result);
          }
      } catch (err) {
          setError(`Could not open ${result.fileName}: ${err instanceof Error ? err.message : err}`);
          return;
      }
      if (runId !== documentRunRef.current) return; // another document was opened meanwhile

      reviewBaselineRef.current = doc;
      setReviewSave({ state: 'idle' });
      setReviewingBulkId(result.id);
      setPdfName(result.fileName);
      setIdentifierStatus(null);
      setExtractionWarning(result.incomplete?.length
          ? `The AI's answer for this file was incomplete — missing: ${result.incomplete.join(', ')}. Use "Retry" or fill in the missing parts.`
          : null);
      setDrmdData(doc);

      // Show the PDF: straight from its file, or from the copy embedded in the document.
      const file = bulkFilesRef.current.get(result.id);
      if (file) {
          const url = URL.createObjectURL(file);
          setPdfUrl(prev => { if (prev) revokeLater(prev); return url; });
          shownRmDataRef.current = (doc.binaryDocuments || []).find(d => d.rmDocument && d.data)?.data || null;
      } else {
          setPdfUrl(prev => { if (prev) revokeLater(prev); return null; });
          shownRmDataRef.current = null;
          syncPaneWith(doc.binaryDocuments || []);
      }

      setActiveTab(opts?.tab || "admin");
  };

  /** A folder row clicked: its document is opened, and its validation report is shown on this tab. */
  const showRowReport = async (result: BulkResult) => {
      await handleBulkReview(result, { tab: 'validate-export' });
      setTimeout(() => document.getElementById('this-document')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };

  const handleBulkDownloadSingle = async (result: BulkResult) => {
      const blob = new Blob([await getBulkXml(result)], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${result.rmCode || result.fileName.replace('.pdf', '')}.xml`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const handleBulkDownloadAll = async () => {
      const successResults = bulkResults.filter(r => r.status === 'done');
      if (successResults.length === 0) return;

      // Create ZIP using JSZip loaded from CDN
      try {
          const JSZipLib = (window as any).JSZip;
          if (!JSZipLib) throw new Error("JSZip not loaded");
          const zip = new JSZipLib();
          // Two certificates can share an RM code (e.g. the English and the German edition). A ZIP
          // keeps only the last file of a given name, so a repeated name gets the PDF's name added.
          const used = new Set<string>();
          const uniqueName = (r: BulkResult) => {
              const first = r.rmCode || sanitizeFilename(outputBaseName(r.fileName)) || 'certificate';
              let name = used.has(first.toLowerCase()) ? `${first}_${sanitizeFilename(outputBaseName(r.fileName)) || 'copy'}` : first;
              for (let n = 2; used.has(name.toLowerCase()); n++) name = `${first}_${n}`;
              used.add(name.toLowerCase());
              return name;
          };
          for (const r of successResults) {
              const baseName = uniqueName(r);
              zip.file(`${baseName}.xml`, await getBulkXml(r));
              zip.file(`${baseName}.html`, r.htmlContent || generateHtmlReport(r.drmdData));
          }
          const content = await zip.generateAsync({ type: 'blob' });
          const url = URL.createObjectURL(content);
          const link = document.createElement('a');
          link.href = url;
          link.download = `DRMD-Bulk-Export-${new Date().toISOString().split('T')[0]}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
      } catch (err) {
          // Fallback: download individually
          console.warn("JSZip not available, downloading individually", err);
          successResults.forEach(r => {
              handleBulkDownloadSingle(r);
              handleBulkDownloadSingleHtml(r);
          });
      }
  };

  const handleBulkReviewHtml = (result: BulkResult) => {
      const html = result.htmlContent || generateHtmlReport(result.drmdData);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      // noopener: the report tab gets no handle back to the generator (and its API key).
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleBulkDownloadSingleHtml = (result: BulkResult) => {
      const html = result.htmlContent || generateHtmlReport(result.drmdData);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${result.rmCode || result.fileName.replace('.pdf', '')}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };



  const handleXmlImport = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files[0]) {
          const file = event.target.files[0];
          dropPendingUpload();
          flushPendingSave();
          setIsProcessing(true);
          setStatusMessage("Reading the XML file…");
          
          const reader = new FileReader();
          reader.onload = (e) => {
              try {
                  const xmlContent = e.target?.result as string;
                  const parsedData = normalizeMaterialLinks(parseDrmdXml(xmlContent));

                  // Show the human-readable PDF embedded in the file. Without one (or if it cannot be read),
                  // the pane is emptied: it must never keep showing the certificate of the previous document.
                  setPdfUrl(prev => { if (prev) revokeLater(prev); return null; });
                  setPdfName("");
                  shownRmDataRef.current = null;
                  syncPaneWith(parsedData.binaryDocuments || []);
                  // Opened from a file: its values are the user's own, not filled in by the AI here.
                  takeOverDoc('xml');

                  documentRunRef.current++;
                  setReviewingBulkId(null);
                  setIdentifierStatus(null);
                  setExtractionWarning(null);
                  setDrmdData(parsedData);
                  setActiveTab("admin");
                  setError(null);
              } catch (err) {
                  const notDrmd = err instanceof Error && /not a DRMD/.test(err.message);
                  setError(notDrmd
                      ? `${file.name} is not a DRMD file, so it was not opened.`
                      : "Failed to parse XML file. Please ensure it is a valid DRMD format.");
                  if (notDrmd) console.warn(err.message); else console.error(err);
              } finally {
                  setIsProcessing(false);
                  setStatusMessage("");
              }
          };
          reader.onerror = () => {
              setError(`Could not read ${file.name}. Please try again.`);
              setIsProcessing(false);
              setStatusMessage("");
          };
          reader.readAsText(file);
          event.target.value = "";
      }
  };

  // ---- New DRMD: an empty form and an empty pane for the next document ----
  const [newDocAsk, setNewDocAsk] = useState(false);
  const startNewDrmd = () => {
      setNewDocAsk(false);
      if (isProcessing || bulkProcessing) return;
      flushPendingSave();          // a folder row being reviewed keeps its last edits
      dropPendingUpload();         // a PDF waiting for an API key is dropped
      documentRunRef.current++;    // late look-ups for the previous document stand down
      unitAiTimers.current.forEach(t => clearTimeout(t));
      unitAiTimers.current.clear();
      setPdfUrl(prev => { if (prev) revokeLater(prev); return null; });
      setPdfName("");
      shownRmDataRef.current = null;
      setReviewingBulkId(null);
      setReviewSave({ state: 'idle' });
      setIdentifierStatus(null);
      setUnitStatus(null);
      setUnitBusy({});
      setExtractionWarning(null);
      setError(null);
      setLookups({});
      setEditingIdsFor(null);
      setHighlightData(null);
      setToastMessage(null);
      takeOverDoc('new');
      const blank = createInitialDrmd();
      blankDocRef.current = blank;
      setDrmdData(blank);
      setActiveTab('admin');
  };
  /** "New DRMD": asks first when the form or the pane holds something that would be cleared. */
  const requestNewDrmd = () => {
      if (isProcessing || bulkProcessing) return;
      if (drmdData === blankDocRef.current && !pdfUrl && !pendingUploadRef.current) { startNewDrmd(); return; }
      setNewDocAsk(true);
  };

  const getExportFilename = () => {
    if (drmdData.materials.length > 0) {
        const firstMat = drmdData.materials[0];

        // 1. The explicit RM Code (e.g. BAM-M386a) is the preferred name.
        const rmCode = sanitizeFilename(firstMat.rmCode || '');
        if (rmCode) return rmCode;

        // 2. Otherwise fall back to a material identifier (scheme-value).
        const id = firstMat.materialIdentifiers.find(i => i.scheme && i.value);
        if (id) {
            const cleanScheme = sanitizeFilename(id.scheme);
            const cleanValue = sanitizeFilename(id.value);
            if (cleanScheme && cleanValue) return `${cleanScheme}-${cleanValue}`;
        }

        // 3. Otherwise use the material name.
        const matName = sanitizeFilename(firstMat.name || '');
        if (matName) return matName;
    }
    return `DRMD-${sanitizeFilename(drmdData.administrativeData.uniqueIdentifier || '') || 'export'}`;
  };

  const handleExport = () => {
    const xmlContent = generateDrmdXml(drmdData);
    const blob = new Blob([xmlContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getExportFilename()}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // The period exactly as the XML generator writes it (whole, non-negative years and months).
  const getIsoDuration = () => {
      const y = Math.max(0, Math.floor(Number(drmdData.administrativeData.durationY) || 0));
      const m = Math.max(0, Math.floor(Number(drmdData.administrativeData.durationM) || 0));
      if (!y && !m) return "P0Y";
      return `P${y ? y + 'Y' : ''}${m ? m + 'M' : ''}`;
  };

  const renderSettings = () => (
      <div>
          <SectionHeader title="AI settings" level="page" />
          <p className="section-lede !mt-0" data-testid="ai-settings-lede">
              Only needed to convert PDFs with AI and for the identifier look-ups. Entering a DRMD by hand, or opening and editing a DRMD XML file, needs no API key.
          </p>

          <div>
          <div className="section">
              <SectionHeader title="AI provider" />
              <p className="section-lede">
                  The generator reads each certificate with an AI model that understands PDF documents (text and page images).
                  Choose a provider and enter your own API key for it; the use is billed to your account with that provider.
                  Keys are kept only while this tab is open, are never saved, and each key is sent only to its own provider.
              </p>
              {aiLocked && (
                  <div className="mb-3 flex items-start gap-2 rounded-md border border-check-line bg-check-bg px-3 py-2 text-sm text-ink" role="status">
                      <Icon name="key" size={14} className="mt-0.5 shrink-0 text-check" />
                      <span>
                          Locked while {bulkProcessing ? 'the folder' : 'the certificate'} is being processed, so that all of its requests go to {providerLabel}
                          {conn.model !== AUTO ? ` (${conn.model})` : ''}. The provider, model and keys can be changed again when it has finished.
                      </span>
                  </div>
              )}
              {pendingUpload && !aiLocked && (
                  <div className="mb-3 flex items-start gap-2 rounded-md border border-petrol-100 bg-petrol-50 px-3 py-2 text-sm text-petrol-900" role="status">
                      <Icon name="file" size={14} className="mt-0.5 shrink-0 text-petrol-600" />
                      <span>
                          {pendingUpload.kind === 'pdf' ? pendingUpload.file.name : pendingUpload.label} is waiting. Enter the API key for {providerLabel} below
                          (or choose another provider): the extraction starts by itself as soon as the key works.
                      </span>
                  </div>
              )}
              <div className="space-y-2.5" role="radiogroup" aria-label="AI provider" aria-disabled={aiLocked || undefined}>
                  {PROVIDER_IDS.map(id => (
                      <ProviderCard
                          key={id}
                          id={id}
                          active={activeProvider === id}
                          apiKey={providerKeys[id]}
                          model={providerModels[id]}
                          check={providerChecks[id]}
                          onActivate={() => { if (!aiLockedRef.current) setActiveProvider(id); }}
                          onKey={(v) => updateProviderKey(id, v)}
                          onModel={(v) => { if (!aiLockedRef.current) setProviderModels(prev => ({ ...prev, [id]: v })); }}
                          locked={aiLocked}
                          onCheck={() => checkProviderKey(id)}
                          region={providerRegions[id]}
                          onRegion={(r) => updateProviderRegion(id, r)}
                      />
                  ))}
              </div>
          </div>

          <UsagePanel activeProvider={activeProvider} />
      </div>
      </div>
  );

  // ---- Home: what the generator does, in plain words ----
  const renderHome = () => (
      <div data-testid="home">
          <SectionHeader title="Home" level="page" />
          <p className="section-lede !mt-0">
              The generator creates a Digital Reference Material Document (DRMD): the machine-readable XML form of a reference material
              certificate or product information sheet. It runs in this browser tab; nothing has to be installed.
          </p>

          <div className="section">
              <SectionHeader title="What you can do" />
              <ol className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  <li className="panel p-4 flex flex-col">
                      <p className="text-xs font-semibold text-petrol-700">1 · Manual entry</p>
                      <h3 className="mt-1 text-md font-semibold text-ink">Enter a DRMD by hand</h3>
                      <p className="mt-1.5 text-sm text-ink-soft flex-1">
                          Fill in the tabs from Administrative to Statements, then check and save the DRMD on Validate &amp; export.
                          No AI and no API key are needed.
                      </p>
                      <div className="mt-3"><button onClick={requestNewDrmd} disabled={busy} className="btn-secondary"><Icon name="plus" /> New DRMD</button></div>
                  </li>
                  <li className="panel p-4 flex flex-col">
                      <p className="text-xs font-semibold text-petrol-700">2 · AI-assisted conversion</p>
                      <h3 className="mt-1 text-md font-semibold text-ink">Convert existing PDF documents</h3>
                      <div className="mt-1.5 text-sm text-ink-soft flex-1 space-y-1.5">
                          <p><span className="font-medium text-ink">(a) Single:</span> the AI fills in the form from one PDF. The PDF is shown alongside, so you can check and edit every value.</p>
                          <p><span className="font-medium text-ink">(b) Bulk:</span> all PDFs of a folder are converted one after another. You can open each result, check it against its PDF and edit it.</p>
                          <p className="hint">Needs your own API key for an AI provider (AI settings).</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn-secondary"><Icon name="file" /> Upload PDF</button>
                          <button onClick={handleOpenFolder} disabled={busy} className="btn-secondary"><Icon name="folder" /> Upload folder</button>
                          <button onClick={() => setActiveTab('settings')} className="btn-quiet"><Icon name="key" /> AI settings</button>
                      </div>
                  </li>
                  <li className="panel p-4 flex flex-col">
                      <p className="text-xs font-semibold text-petrol-700">3 · Loading &amp; editing</p>
                      <h3 className="mt-1 text-md font-semibold text-ink">Open and edit a DRMD</h3>
                      <p className="mt-1.5 text-sm text-ink-soft flex-1">
                          Open a DRMD XML file, for example one you saved earlier, edit it and save it again.
                          The PDF embedded in it is shown alongside.
                      </p>
                      <div className="mt-3"><button onClick={() => xmlInputRef.current?.click()} disabled={busy} className="btn-secondary"><Icon name="import" /> Import XML</button></div>
                  </li>
              </ol>
          </div>

          <div className="section">
              <SectionHeader title="Validation and saving" docs={DOCS_PATHS.validationRules} />
              <dl className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm max-w-[80ch]">
                  <dt className="text-ink-muted">Validation</dt>
                  <dd>
                      Every change is checked at once against the DRMD 1.0.0 XML schema and the official business rules (Schematron).
                      The bar at the bottom of the window shows the result. Validate &amp; export lists each finding:
                      <span className="font-medium"> Error</span> (must be corrected before the DRMD is valid),
                      <span className="font-medium"> Check</span> (a rule that applies only in some cases) and
                      <span className="font-medium"> Note</span> (a hint).
                  </dd>
                  <dt className="text-ink-muted">Saving</dt>
                  <dd>
                      Save the DRMD XML, and if you like an HTML report, on Validate &amp; export. Nothing is stored on a server, and nothing is kept
                      when this tab is closed: to continue later, save the XML and open it again with Import XML.
                      {canWriteFolders ? ' A bulk conversion saves each XML and HTML file into the folder as soon as it is ready.' : ' A bulk conversion keeps its results in this tab, to be downloaded as a ZIP file.'}
                  </dd>
              </dl>
          </div>

          <div className="section">
              <SectionHeader title="Signing and sealing" docs={DOCS_PATHS.digitalSignature} />
              <p className="text-sm text-ink max-w-[80ch]">
                  The generator does not sign or seal. A DRMD is signed after it has been saved, with your organisation's signing software and certificate:
                  usually sealed by the producer (an electronic seal with the organisation's certificate), and where needed also signed by a responsible person.
                  Both are added to the XML as an XML signature (ds:Signature). Sign only the finished file, because any later change breaks the signature.
                  The guidance document describes this in the chapter Digital signature.
              </p>
          </div>

          <div className="section">
              <SectionHeader title="About this file" />
              <dl className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink-muted">Runs in</dt>
                  <dd>This browser tab only. Nothing to install; nothing is stored on a server.</dd>
                  <dt className="text-ink-muted">Sends data to</dt>
                  <dd>
                      Only when you use the AI or a look-up: the AI provider chosen in AI settings (the certificate PDF, for extraction; {providerLabel} at the moment),
                      PubChem and CAS Common Chemistry (substance names, for CAS / InChIKey), ROR (producer names). A DRMD entered by hand or opened from a file is not sent anywhere.
                  </dd>
                  <dt className="text-ink-muted">Amber fields</dt>
                  <dd>Values the AI filled in that do not appear word for word in the PDF. Compare each with the certificate (the locate button marks where it came from), then mark it as verified. Editing a value also counts as verified. Values you enter yourself are never marked.</dd>
                  <dt className="text-ink-muted">Output</dt>
                  <dd>DRMD 1.0.0 XML, checked against the schema and the official business rules, and an HTML report.</dd>
                  <dt className="text-ink-muted">Version</dt>
                  <dd className="tabular-nums">{__APP_VERSION__}</dd>
                  <dt className="text-ink-muted">Licence</dt>
                  <dd>
                      © {__COPYRIGHT_YEARS__} Bundesanstalt für Materialforschung und -prüfung (BAM). Licensed under the EUPL v1.2 (European Union Public Licence).
                      The licence text and the licences of the included third-party software are at the end of this file and in the{' '}
                      <a href={__SOURCE_URL__} target="_blank" rel="noopener noreferrer" className="text-petrol-600 underline underline-offset-2 hover:text-petrol-700">source code repository</a>.
                      The DRMD files and reports you create with the generator are your own documents.
                  </dd>
                  <dt className="text-ink-muted">Changes</dt>
                  <dd>
                      BAM maintains the generator. To report an error or suggest a change, please write to{' '}
                      <a href="mailto:drmd@bam.de" className="text-petrol-600 underline underline-offset-2 hover:text-petrol-700">drmd@bam.de</a>.
                  </dd>
                  <dt className="text-ink-muted">Funding</dt>
                  <dd>The development of the Digital Reference Material Document (DRMD) is partially funded and supported by the QI-Digital project.</dd>
              </dl>

              <div className="mt-6 pt-5 border-t border-line-soft">
                  <h3 className="text-sm font-semibold text-ink">Video guide</h3>
                  <p className="hint mt-1 max-w-[68ch]">A 12-minute video shows every step, from entering the API key to exporting the DRMD, with chapters and a transcript. It opens in a new tab, so your work here stays open.</p>
                  <a href={VIDEO_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3">
                      <Icon name="play" size={14} /> Watch the video guide <Icon name="external" size={13} className="text-ink-muted" />
                  </a>
              </div>
          </div>
      </div>
  );

  const updateProducer = (idx: number, mutate: (p: any) => void) => {
      const list = [...drmdData.administrativeData.producers];
      mutate(list[idx]);
      setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}}));
  };

  const renderAdmin = () => (
    <div>
        <SectionHeader title="Administrative data" level="page" />

        <div className="section">
            <SectionHeader title="Basic information" docs={DOCS_PATHS.coreData} />
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.6fr)] gap-4">
                <Select label="Title of document *" value={drmdData.administrativeData.title} options={ALLOWED_TITLES} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, title: v}}))} />
                <div className="flex gap-1.5 items-end">
                    <div className="flex-1 min-w-0">
                        <Input mono noVerify label="Unique identifier *" value={drmdData.administrativeData.uniqueIdentifier} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, uniqueIdentifier: v}}))} onFocus={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.uniqueIdentifier, null, drmdData.administrativeData.uniqueIdentifier, drmdData.administrativeData.originalTexts?.uniqueIdentifier)} source={drmdData.administrativeData.originalTexts?.uniqueIdentifier} onInfoClick={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.uniqueIdentifier, null, drmdData.administrativeData.uniqueIdentifier, drmdData.administrativeData.originalTexts?.uniqueIdentifier)} />
                    </div>
                    <button onClick={() => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, uniqueIdentifier: generateUUID()}}))} className="btn-secondary w-8 px-0" title="Generate a new UUID" aria-label="Generate a new UUID"><Icon name="refresh" /></button>
                </div>
                <Input label="Document version *" value={drmdData.administrativeData.documentVersion} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, documentVersion: v}}))} />
            </div>

            <h3 className="mt-6 mb-3 text-sm font-semibold text-ink-soft"><DocsLabel label="Period of validity" quiet /></h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <Select
                    label="Validity type *"
                    value={drmdData.administrativeData.validityType}
                    options={["Until Revoked", "Time After Dispatch", "Specific Time"]}
                    onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, validityType: v as any}}))}
                    onFocus={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.validityType, null, drmdData.administrativeData.validityType, drmdData.administrativeData.originalTexts?.validityType)}
                    onInfoClick={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.validityType, null, drmdData.administrativeData.validityType, drmdData.administrativeData.originalTexts?.validityType)}
                />

                {drmdData.administrativeData.validityType === "Time After Dispatch" && (
                    <>
                        <fieldset>
                            <legend className="field-label mb-1"><LabelText label="Period after dispatch *" /></legend>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Years" type="number" value={drmdData.administrativeData.durationY} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, durationY: parseInt(v) || 0}}))} />
                            <Input label="Months" type="number" value={drmdData.administrativeData.durationM} onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, durationM: parseInt(v) || 0}}))} />
                        </div>
                        </fieldset>
                        <div className="space-y-3">
                            <div className="w-full">
                                <div className="flex items-center justify-between gap-2 mb-1 min-h-[18px]">
                                    <span className="field-label"><DocsLabel label="ISO 8601 format">ISO 8601 period</DocsLabel></span>
                                    {pdfUrl && <button
                                        type="button"
                                        className="-my-1 inline-flex items-center justify-center w-6 h-6 rounded text-ink-faint hover:text-petrol-600 hover:bg-petrol-50"
                                        onClick={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.durationM || drmdData.administrativeData.fieldCoordinates?.durationY, null, getIsoDuration())}
                                        title="Show the duration in the PDF"
                                        aria-label="Show the duration in the PDF"
                                    >
                                        <Icon name="locate" size={14} />
                                    </button>}
                                </div>
                                <div className="computed" title="Written to the XML">{getIsoDuration()}</div>
                            </div>
                            <Input
                                label="Dispatch date"
                                type="date"
                                value={drmdData.administrativeData.dateOfIssue}
                                onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, dateOfIssue: v}}))}
                                onFocus={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.dateOfIssue, null, drmdData.administrativeData.dateOfIssue, drmdData.administrativeData.originalTexts?.dateOfIssue)}
                            />
                            <UnreadableDate value={drmdData.administrativeData.dateOfIssue} />
                        </div>
                    </>
                )}
                {drmdData.administrativeData.validityType === "Specific Time" && (
                    <Input
                        label="Valid until *"
                        type="date"
                        value={drmdData.administrativeData.specificTime}
                        onChange={(v) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, specificTime: v}}))}
                        onFocus={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.specificTime, null, drmdData.administrativeData.specificTime, drmdData.administrativeData.originalTexts?.specificTime)}
                        onInfoClick={() => handleHighlight(drmdData.administrativeData.fieldCoordinates?.specificTime, null, drmdData.administrativeData.specificTime, drmdData.administrativeData.originalTexts?.specificTime)}
                    />
                )}
                {drmdData.administrativeData.validityType === "Specific Time" && <UnreadableDate value={drmdData.administrativeData.specificTime} />}
            </div>
        </div>

        <div className="section">
            <SectionHeader
                title="Reference material producer"
                docs={DOCS_PATHS.producer}
                action={<button onClick={() => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: [...p.administrativeData.producers, newProducer()]}}))} className="btn-quiet btn-sm"><Icon name="plus" size={14} /> Add producer</button>}
            />
            {drmdData.administrativeData.producers.length > 1 && (
                <p className="section-lede inline-flex items-center gap-1.5 text-check"><Icon name="alert" size={14} /> A DRMD names exactly one producer. Remove the extra entries before export.</p>
            )}
            {drmdData.administrativeData.producers.map((prod, idx) => (
                <div key={prod.uuid} className="entry">
                     <div className="entry-head">
                        <span className="entry-title">{drmdData.administrativeData.producers.length > 1 ? `Producer ${idx + 1}` : 'Producer'}</span>
                        <button onClick={() => {
                            if (drmdData.administrativeData.producers.length > 1) {
                                const newProds = [...drmdData.administrativeData.producers];
                                newProds.splice(idx, 1);
                                setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: newProds}}));
                            }
                        }} className="icon-btn-danger" disabled={drmdData.administrativeData.producers.length <= 1} title="Remove producer" aria-label="Remove producer"><Icon name="trash" /></button>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                        <div className="space-y-3">
                            <Input label="Name *" value={prod.name} docs={DOCS_PATHS.producerName} onFocus={() => handleHighlight(prod.fieldCoordinates?.name, prod.sectionCoordinates, prod.name, prod.originalTexts?.name)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].name = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.name} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.name, prod.sectionCoordinates, prod.name, prod.originalTexts?.name)} />
                            <Input label="Email" value={prod.email} onFocus={() => handleHighlight(prod.fieldCoordinates?.email, prod.sectionCoordinates, prod.email, prod.originalTexts?.email)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].email = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.email} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.email, prod.sectionCoordinates, prod.email, prod.originalTexts?.email)} />
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="Phone" value={prod.phone} onFocus={() => handleHighlight(prod.fieldCoordinates?.phone, prod.sectionCoordinates, prod.phone, prod.originalTexts?.phone)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].phone = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.phone} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.phone, prod.sectionCoordinates, prod.phone, prod.originalTexts?.phone)} />
                                <Input label="Fax" value={prod.fax} onFocus={() => handleHighlight(prod.fieldCoordinates?.fax, prod.sectionCoordinates, prod.fax, prod.originalTexts?.fax)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].fax = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.fax} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.fax, prod.sectionCoordinates, prod.fax, prod.originalTexts?.fax)} />
                            </div>
                        </div>
                        <fieldset className="space-y-3">
                            <legend className="field-label mb-1 float-left w-full">
                                <LabelText label="Address *" /> <span className="font-normal text-ink-faint">at least one field</span>
                            </legend>
                            <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-3 clear-both">
                                <Input label="Street" value={prod.address.street} onFocus={() => handleHighlight(prod.fieldCoordinates?.street, prod.sectionCoordinates, prod.address.street, prod.originalTexts?.street, { kind: 'address', address: prod.address, name: prod.name, line: prod.originalTexts?.countryCode })} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.street = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.street} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.street, prod.sectionCoordinates, prod.address.street, prod.originalTexts?.street, { kind: 'address', address: prod.address, name: prod.name, line: prod.originalTexts?.countryCode })} />
                                <Input label="No." value={prod.address.streetNo} onFocus={() => handleHighlight(prod.fieldCoordinates?.streetNo, prod.sectionCoordinates, prod.address.streetNo, prod.originalTexts?.streetNo, { kind: 'address', address: prod.address, name: prod.name, line: prod.originalTexts?.countryCode })} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.streetNo = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.streetNo} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.streetNo, prod.sectionCoordinates, prod.address.streetNo, prod.originalTexts?.streetNo, { kind: 'address', address: prod.address, name: prod.name, line: prod.originalTexts?.countryCode })} />
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
                                <Input label="Post code" value={prod.address.postCode} onFocus={() => handleHighlight(prod.fieldCoordinates?.postCode, prod.sectionCoordinates, prod.address.postCode, prod.originalTexts?.postCode)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.postCode = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.postCode} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.postCode, prod.sectionCoordinates, prod.address.postCode, prod.originalTexts?.postCode)} />
                                <Input label="City" value={prod.address.city} onFocus={() => handleHighlight(prod.fieldCoordinates?.city, prod.sectionCoordinates, prod.address.city, prod.originalTexts?.city)} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.city = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.city} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.city, prod.sectionCoordinates, prod.address.city, prod.originalTexts?.city)} />
                                <Input label="Country" placeholder="Two-letter code, e.g. US" value={prod.address.countryCode} onFocus={() => handleHighlight(prod.fieldCoordinates?.countryCode, prod.sectionCoordinates, prod.address.countryCode, prod.originalTexts?.countryCode, { kind: 'country', address: prod.address })} onChange={(v) => { const list = [...drmdData.administrativeData.producers]; list[idx].address.countryCode = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}})); }} source={prod.originalTexts?.countryCode} onInfoClick={() => handleHighlight(prod.fieldCoordinates?.countryCode, prod.sectionCoordinates, prod.address.countryCode, prod.originalTexts?.countryCode, { kind: 'country', address: prod.address })} />
                            </div>
                        </fieldset>
                     </div>

                     {/* ROR ID */}
                     <div className="mt-4 pt-3 border-t border-line-soft">
                         <div className="flex items-center justify-between mb-2">
                             <span className="flex items-center gap-1">
                                 <span className="field-label">ROR ID <span className="font-normal text-ink-faint">(Research Organization Registry)</span></span>
                                 <LookupButton busy={lookups[`ror:${prod.uuid}`]?.busy} onClick={() => lookUpProducerRor(prod.uuid)} label="Find the ROR ID from the name, city and country" />
                             </span>
                             <button onClick={() => updateProducer(idx, p => { p.organizationIdentifiers = [...(p.organizationIdentifiers || []), { scheme: 'ROR', value: '', link: '' }]; })} className="btn-link text-xs"><Icon name="plus" size={13} /> Add ROR ID</button>
                         </div>
                         <LookupNote state={lookups[`ror:${prod.uuid}`]} className="-mt-1 mb-2" />
                         {(prod.organizationIdentifiers || []).length === 0 && <p className="hint">None yet. Add one, or find it with the search button from the name, city and country.</p>}
                         <div className="space-y-2">
                         {(prod.organizationIdentifiers || []).map((orgId, oidIdx) => (
                             <div key={oidIdx} className="flex items-center gap-2 max-w-[440px]">
                                 <input
                                     type="text"
                                     value={orgId.value || ''}
                                     onChange={(e) => {
                                         const list = [...drmdData.administrativeData.producers];
                                         list[idx].organizationIdentifiers[oidIdx] = {
                                             scheme: 'ROR',
                                             value: e.target.value,
                                             link: e.target.value ? `https://ror.org/${e.target.value}` : ''
                                         };
                                         setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}}));
                                     }}
                                     placeholder="e.g. 03x516a66"
                                     aria-label="ROR ID"
                                     className="field-control text-sm tabular-nums flex-1"
                                 />
                                 {orgId.value && <a href={`https://ror.org/${orgId.value}`} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Open in ROR" aria-label="Open in ROR"><Icon name="external" size={15} /></a>}
                                 {(prod.organizationIdentifiers || []).length > 1 && (
                                     <button onClick={() => {
                                         const list = [...drmdData.administrativeData.producers];
                                         list[idx].organizationIdentifiers.splice(oidIdx, 1);
                                         setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, producers: list}}));
                                     }} className="icon-btn-danger" title="Remove ROR ID" aria-label="Remove ROR ID"><Icon name="trash" /></button>
                                 )}
                             </div>
                         ))}
                         </div>
                     </div>
                </div>
            ))}
        </div>

        <div className="section">
            <SectionHeader
                title="Responsible persons"
                docs={DOCS_PATHS.responsiblePersons}
                action={<button onClick={() => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: [...p.administrativeData.responsiblePersons, {...INITIAL_PERSON, uuid: generateUUID()}]}}))} className="btn-quiet btn-sm"><Icon name="plus" size={14} /> Add person</button>}
            />
            {drmdData.administrativeData.responsiblePersons.map((rp, idx) => (
                <div key={rp.uuid} className="entry">
                     <div className="entry-head">
                        <span className="entry-title">Person {idx + 1}</span>
                        <div className="flex items-center gap-3">
                            <CheckWithDocs label="Main signer" checked={rp.mainSigner} onChange={(checked) => setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: p.administrativeData.responsiblePersons.map((x, i) => i === idx ? { ...x, mainSigner: checked } : x)}}))} />
                            <button onClick={() => {
                                if (drmdData.administrativeData.responsiblePersons.length > 1) {
                                    const list = [...drmdData.administrativeData.responsiblePersons]; list.splice(idx, 1); setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}}));
                                }
                            }} className="icon-btn-danger" disabled={drmdData.administrativeData.responsiblePersons.length <= 1} title="Remove person" aria-label="Remove person"><Icon name="trash" /></button>
                        </div>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                         <div className="space-y-3">
                            <Input label={drmdData.administrativeData.title === "referenceMaterialCertificate" ? "Name *" : "Name"} value={rp.name} docs={DOCS_PATHS.personDetails} onFocus={() => handleHighlight(getMergedBox([rp.sectionCoordinates, rp.fieldCoordinates?.name, rp.fieldCoordinates?.role, rp.fieldCoordinates?.description]), null, rp.name, rp.originalTexts?.name)} onChange={(v) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].name = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} source={rp.originalTexts?.name} onInfoClick={() => handleHighlight(getMergedBox([rp.sectionCoordinates, rp.fieldCoordinates?.name, rp.fieldCoordinates?.role, rp.fieldCoordinates?.description]), null, rp.name, rp.originalTexts?.name)} />
                            <Input label={drmdData.administrativeData.title === "referenceMaterialCertificate" ? "Role *" : "Role"} value={rp.role} onFocus={() => handleHighlight(getMergedBox([rp.sectionCoordinates, rp.fieldCoordinates?.name, rp.fieldCoordinates?.role, rp.fieldCoordinates?.description]), null, rp.role, rp.originalTexts?.role)} onChange={(v) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].role = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} source={rp.originalTexts?.role} onInfoClick={() => handleHighlight(getMergedBox([rp.sectionCoordinates, rp.fieldCoordinates?.name, rp.fieldCoordinates?.role, rp.fieldCoordinates?.description]), null, rp.role, rp.originalTexts?.role)} />
                         </div>
                         <TextArea label="Description" value={rp.description} docs={DOCS_PATHS.responsiblePerson} onFocus={() => handleHighlight(getMergedBox([rp.sectionCoordinates, rp.fieldCoordinates?.name, rp.fieldCoordinates?.role, rp.fieldCoordinates?.description]), null, rp.description, rp.originalTexts?.description)} onChange={(v) => { const list = [...drmdData.administrativeData.responsiblePersons]; list[idx].description = v; setDrmdData(p => ({...p, administrativeData: {...p.administrativeData, responsiblePersons: list}})); }} source={rp.originalTexts?.description} onInfoClick={() => handleHighlight(getMergedBox([rp.sectionCoordinates, rp.fieldCoordinates?.name, rp.fieldCoordinates?.role, rp.fieldCoordinates?.description]), null, rp.description, rp.originalTexts?.description)} />
                     </div>
                </div>
            ))}
        </div>
    </div>
  );

  const renderMaterials = () => (
    <div>
        <SectionHeader
            title="Materials"
            level="page"
            docs={DOCS_PATHS.materials}
            action={<button onClick={() => setDrmdData(p => ({...p, materials: [...p.materials, {
                uuid: generateUUID(), xmlId: `mat_unknown`, name: "", rmCode: "", description: "", materialClass: "", itemQuantities: "", minimumSampleSize: "", isCertified: false, materialIdentifiers: [{...INITIAL_ID}]
            }]}))} className="btn-secondary btn-sm"><Icon name="plus" size={14} /> Add material</button>}
        />

        {drmdData.materials.map((mat, idx) => (
            <div key={mat.uuid} className="entry">
                <div className="entry-head">
                    <span className="entry-title">Material {idx + 1}{mat.name ? <span className="font-normal text-ink-muted"> · {mat.name}</span> : null}</span>
                    <button onClick={() => {
                        if(drmdData.materials.length > 1) {
                            // Links to the removed material are cleared too: a link to a material that no
                            // longer exists would show "None" in the form but drop the material link in the XML.
                            const removed = mat.uuid;
                            const list = [...drmdData.materials]; list.splice(idx, 1);
                            setDrmdData(p => ({...p, materials: list, properties: p.properties.map(pr => ({
                                ...pr,
                                materialRef: pr.materialRef === removed ? undefined : pr.materialRef,
                                results: pr.results.map(r => r.materialRef === removed ? { ...r, materialRef: undefined } : r),
                            }))}));
                        }
                    }} className="icon-btn-danger" disabled={drmdData.materials.length <= 1} title="Remove material" aria-label="Remove material"><Icon name="trash" /></button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                    <div className="space-y-3">
                        <Input label="Name *" value={mat.name} docs={DOCS_PATHS.materialName} onFocus={() => handleHighlight(mat.fieldCoordinates?.name, mat.sectionCoordinates, mat.name, mat.originalTexts?.name)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].name = v; setDrmdData(p => ({...p, materials: list})); }} source={mat.originalTexts?.name} onInfoClick={() => handleHighlight(mat.fieldCoordinates?.name, mat.sectionCoordinates, mat.name, mat.originalTexts?.name)} />
                        <Input mono label="RM code (e.g. BAM-M386a) *" value={mat.rmCode || ""} onChange={(v) => { const list = [...drmdData.materials]; list[idx].rmCode = v; setDrmdData(p => ({...p, materials: list})); }} onFocus={() => handleHighlight(mat.rmCode)} onInfoClick={() => handleHighlight(mat.rmCode)} />
                        
                        {mat.materialIdentifiers.map((mid, midIdx) => {
                             // CAS / InChIKey are chemical identifiers — shown in their own
                             // section below, NOT as editable Batch/Lot rows.
                             const schemeLower = (mid.scheme || "").toLowerCase();
                             if (schemeLower === 'cas' || schemeLower === 'inchikey') return null;
                             const hasScheme = mid.scheme && mid.scheme !== "MaterialID" && mid.scheme.trim() !== "";
                             const compositeValue = hasScheme ? `${mid.scheme}-${mid.value}` : mid.value;
                             return (
                                 <Input
                                     key={midIdx}
                                     source={mid.value}
                                     label="Material identifier (e.g. Batch, Lot)"
                                     value={compositeValue}
                                     onFocus={() => handleHighlight(mat.fieldCoordinates?.materialIdentifiers, mat.sectionCoordinates, compositeValue.trim())}
                                     onChange={(val) => {
                                         const list = [...drmdData.materials];
                                         let scheme = "";
                                         let value = val;
                                         const hyphenIdx = val.indexOf('-');
                                         const spaceIdx = val.indexOf(' ');
                                         if (hyphenIdx !== -1) {
                                             scheme = val.substring(0, hyphenIdx).trim();
                                             value = val.substring(hyphenIdx + 1).trim();
                                         } else if (spaceIdx !== -1) {
                                             scheme = val.substring(0, spaceIdx).trim();
                                             value = val.substring(spaceIdx + 1).trim();
                                         }
                                         list[idx].materialIdentifiers[midIdx].scheme = scheme;
                                         list[idx].materialIdentifiers[midIdx].value = value;
                                         setDrmdData(p => ({...p, materials: list}));
                                     }}
                                     onInfoClick={() => handleHighlight(mat.fieldCoordinates?.materialIdentifiers, mat.sectionCoordinates, compositeValue.trim())}
                                 />
                             );
                        })}

                        <Input label="Material class" value={mat.materialClass} onFocus={() => handleHighlight(mat.fieldCoordinates?.materialClass, mat.sectionCoordinates, mat.materialClass, mat.originalTexts?.materialClass)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].materialClass = v; setDrmdData(p => ({...p, materials: list})); }} source={mat.originalTexts?.materialClass} onInfoClick={() => handleHighlight(mat.fieldCoordinates?.materialClass, mat.sectionCoordinates, mat.materialClass, mat.originalTexts?.materialClass)} />
                        
                        <div className="space-y-1">
                            <Input label="Item quantities" value={mat.itemQuantities} onFocus={() => handleHighlight(mat.fieldCoordinates?.itemQuantities, mat.sectionCoordinates, mat.itemQuantities, mat.originalTexts?.itemQuantities)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].itemQuantities = v; setDrmdData(p => ({...p, materials: list})); }} source={mat.originalTexts?.itemQuantities} onInfoClick={() => handleHighlight(mat.fieldCoordinates?.itemQuantities, mat.sectionCoordinates, mat.itemQuantities, mat.originalTexts?.itemQuantities)} />
                            <div className="computed" title="D-SI form written to the XML">{getDsiPreview(mat.itemQuantities)}</div>
                        </div>
                    </div>
                    <div className="space-y-3">
                         <TextArea label={drmdData.administrativeData.title === "referenceMaterialCertificate" ? "Description *" : "Description"} value={mat.description} docs={DOCS_PATHS.materialDescription} onFocus={() => handleHighlight(mat.fieldCoordinates?.description, mat.sectionCoordinates, mat.description, mat.originalTexts?.description)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].description = v; setDrmdData(p => ({...p, materials: list})); }} source={mat.originalTexts?.description} onInfoClick={() => handleHighlight(mat.fieldCoordinates?.description, mat.sectionCoordinates, mat.description, mat.originalTexts?.description)} />
                         <div className="grid grid-cols-1 gap-4 items-end">
                             <div className="space-y-1">
                                <Input label="Minimum sample size (e.g. 4.9 g)" value={mat.minimumSampleSize} onFocus={() => handleHighlight(mat.fieldCoordinates?.minimumSampleSize, mat.sectionCoordinates, mat.minimumSampleSize, mat.originalTexts?.minimumSampleSize)} onChange={(v) => { const list = [...drmdData.materials]; list[idx].minimumSampleSize = v; setDrmdData(p => ({...p, materials: list})); }} source={mat.originalTexts?.minimumSampleSize} onInfoClick={() => handleHighlight(mat.fieldCoordinates?.minimumSampleSize, mat.sectionCoordinates, mat.minimumSampleSize, mat.originalTexts?.minimumSampleSize)} />
                                <div className="computed" title="D-SI form written to the XML">{getDsiPreview(mat.minimumSampleSize)}</div>
                             </div>
                         </div>
                    </div>
                </div>
                {/* Material Identifier: CAS / InChIKey, looked up from the material name and editable here */}
                <div className="mt-4 max-w-[640px]">
                    <div className="flex items-center gap-1 mb-1">
                        <span className="field-label"><DocsLabel label="Material Identifier (CAS / InChIKey)" docs={DOCS_PATHS.materialIdentifiers}>Chemical identifiers (CAS / InChIKey)</DocsLabel></span>
                        <LookupButton busy={lookups[`mat:${mat.uuid}`]?.busy} onClick={() => lookUpMaterialIds(mat.uuid)} label="Find the CAS number and InChIKey from the material name and description" />
                    </div>
                    <LookupNote state={lookups[`mat:${mat.uuid}`]} className="mb-2" />
                    <ChemIdEditor
                        label={`Material ${idx + 1}`}
                        ids={(mat.materialIdentifiers || []).filter(isChemId)}
                        emptyText="None yet. Add one if the material has an identifier."
                        onChange={(chem) => {
                            const list = [...drmdData.materials];
                            const others = (list[idx].materialIdentifiers || []).filter(mid => !isChemId(mid));
                            list[idx] = { ...list[idx], materialIdentifiers: [...others, ...chem], identifiersEdited: true };
                            setDrmdData(p => ({...p, materials: list}));
                        }}
                    />
                </div>
            </div>
        ))}
    </div>
  );

  const renderProperties = () => (
      <div>
          <SectionHeader
              title="Properties"
              level="page"
              docs={DOCS_PATHS.properties}
              action={<button onClick={() => setDrmdData(p => ({...p, properties: [...p.properties, {
                  uuid: generateUUID(), id: "", name: "New property set", isCertified: true, description: "", procedures: "", materialRef: undefined, results: []
              }]}))} className="btn-secondary btn-sm"><Icon name="plus" size={14} /> Add property set</button>}
          />
          {drmdData.properties.length === 0 && (
              <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
                  <p className="text-md font-medium">No property sets yet</p>
                  <p className="mt-1 text-sm text-ink-muted">Certified and informative values are grouped in property sets. Extraction fills them in, or add one by hand.</p>
              </div>
          )}

          {drmdData.properties.map((prop, pIdx) => {
              // Certified values on a certificate need an uncertainty (RMC-006, error). k and p are
              // optional per row: with both, the uncertainty is written as si:expandedMU; with
              // neither, as si:standardMU.
              const uncRequired = drmdData.administrativeData.title === "referenceMaterialCertificate" && prop.isCertified;
              return (
              <div key={prop.uuid} className={`rounded-md border bg-white mb-6 overflow-hidden ${prop.isCertified && drmdData.administrativeData.title !== "productInformationSheet" ? 'border-line-strong border-l-[3px] border-l-ok' : 'border-line-strong border-l-[3px] border-l-ink-faint'}`}>
                   <div className="flex items-center gap-3 px-4 py-2.5 bg-sunken border-b border-line">
                        <input
                            type="text"
                            value={prop.name}
                            aria-label="Property set name"
                            onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].name = e.target.value; setDrmdData(p => ({...p, properties: list})); }}
                            className="flex-1 min-w-0 h-8 px-2 -ml-2 rounded border border-transparent bg-transparent text-md font-semibold text-ink hover:border-line-strong focus:border-petrol-600 focus:bg-white focus:outline-none"
                        />
                        <input
                            type="text"
                            value={prop.id || ""}
                            placeholder="ID (optional)"
                            aria-label="Property set ID"
                            onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].id = e.target.value; setDrmdData(p => ({...p, properties: list})); }}
                            className="w-36 h-7 px-2 rounded border border-line bg-white text-sm placeholder:text-ink-faint hover:border-ink-faint focus:border-petrol-600 focus:outline-none"
                        />
                        {drmdData.administrativeData.title === "productInformationSheet"
                            ? <CheckWithDocs label="Certified" checked={false} disabled onChange={() => {}} note="only on a certificate"
                                  title="A product information sheet has no certified values. To certify values, choose Reference material certificate as the title of the document (Administrative tab)." />
                            : <CheckWithDocs label="Certified" checked={prop.isCertified} onChange={(checked) => setDrmdData(p => ({...p, properties: p.properties.map((x, i) => i === pIdx ? { ...x, isCertified: checked } : x)}))} />}
                        <button onClick={() => { const list = [...drmdData.properties]; list.splice(pIdx, 1); setDrmdData(p => ({...p, properties: list})); }} className="icon-btn-danger" title="Remove property set" aria-label="Remove property set"><Icon name="trash" /></button>
                   </div>
                   <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                            <TextArea label="Description" value={prop.description} docs={DOCS_PATHS.propertiesBlock} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].description = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(prop.description)} />
                            <TextArea label="Procedures" value={prop.procedures} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].procedures = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(prop.procedures)} />
                        </div>
                        <div className="max-w-md">
                            <label className="field-label mb-1"><DocsLabel label="Linked Material (refId)">Linked material</DocsLabel></label>
                            <select
                                value={prop.materialRef || ""}
                                onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].materialRef = e.target.value || undefined; list[pIdx].results.forEach(r => { r.materialRef = undefined; }); setDrmdData(p => ({...p, properties: list})); }}
                                className="field-control"
                            >
                                <option value="">None (applies to all materials)</option>
                                {drmdData.materials.map(m => (
                                    <option key={m.uuid} value={m.uuid}>{m.name || m.rmCode || "Unnamed Material"}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="space-y-5 pt-2">
                            {prop.results.map((res, rIdx) => (
                                <div key={res.uuid} className="rounded-md border border-line bg-sunken/60 p-3">
                                    <div className="flex gap-4 mb-3 items-start">
                                        <div className="flex-1 space-y-3">
                                            <Input label="Table name *" value={res.name} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.name)} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].name = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(res.sectionCoordinates, null, res.name)} />
                                            {/* Linked Batch/Lot — a dropdown of the Lot/Batch numbers defined on
                                                the materials. Only lot/batch identifiers are offered, so the generated
                                                refId always points at a real <drmd:materialIdentifier> id. Scoped to
                                                the property set's linked material when one is selected. */}
                                            {(() => {
                                                const scoped = prop.materialRef
                                                    ? drmdData.materials.filter(m => m.uuid === prop.materialRef)
                                                    : drmdData.materials;
                                                // Chemical / catalogue identifiers are never a batch or lot.
                                                const NEVER_BATCH = ['cas', 'inchikey', 'catalognumber', 'ror', 'uri', 'doi'];
                                                // A batch/lot is identified by its scheme ("Batch", "Lot", "Lot No.",
                                                // "Charge") — and also by the value, since the Materials tab only
                                                // splits a scheme off the text when it contains a hyphen or space,
                                                // so wording like "Lot No. 1234" can land wholly in the value.
                                                const BATCH_WORDS = /(lot|batch|charge)/i;
                                                const opts: { value: string; label: string }[] = [];
                                                scoped.forEach(m => {
                                                    (m.materialIdentifiers || []).forEach(mid => {
                                                        const scheme = (mid.scheme || "").trim();
                                                        const value = (mid.value || "").trim();
                                                        if (!value) return;
                                                        if (NEVER_BATCH.includes(scheme.toLowerCase())) return;
                                                        if (!BATCH_WORDS.test(scheme) && !BATCH_WORDS.test(value)) return;
                                                        if (opts.some(o => o.value === value)) return;
                                                        const matLabel = scoped.length > 1 ? ` — ${m.name || m.rmCode || "Unnamed Material"}` : "";
                                                        opts.push({ value, label: `${scheme ? scheme + ': ' : ''}${value}${matLabel}` });
                                                    });
                                                });
                                                const current = (res.linkedBatchLot || "").trim();
                                                // A value from extraction or an imported XML that is not among the
                                                // defined identifiers stays selectable, so opening this dropdown
                                                // never silently drops it.
                                                const orphan = current !== "" && !opts.some(o => o.value === current);
                                                return (
                                                    <div>
                                                        <label className="field-label mb-1"><DocsLabel label="Linked Batch/Lot">Linked batch / lot</DocsLabel></label>
                                                        <select
                                                            value={current}
                                                            onChange={(e) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].linkedBatchLot = e.target.value || undefined; setDrmdData(p => ({...p, properties: list})); }}
                                                            className="field-control"
                                                        >
                                                            <option value="">None (applies to all)</option>
                                                            {orphan && <option value={current}>{current} (not defined on any material)</option>}
                                                            {opts.map(o => (
                                                                <option key={o.value} value={o.value}>{o.label}</option>
                                                            ))}
                                                        </select>
                                                        {opts.length === 0 && (
                                                            <p className="hint mt-1">
                                                                To link a batch or lot, first add it as a material identifier on the Materials tab (e.g. "Batch-CRM0011-01-A").
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex-[1.6]">
                                            <TextArea rows={5} label="Table description" value={res.description} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.description)} onChange={(v) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].description = v; setDrmdData(p => ({...p, properties: list})); }} onInfoClick={() => handleHighlight(res.sectionCoordinates, null, res.description)} />
                                        </div>
                                        <button onClick={() => { const list = [...drmdData.properties]; list[pIdx].results.splice(rIdx, 1); setDrmdData(p => ({...p, properties: list})); }} className="icon-btn-danger mt-5" title="Remove table" aria-label="Remove table"><Icon name="trash" /></button>
                                    </div>
                                    
                                    <div className="overflow-x-auto bg-white border border-line rounded relative">
                                        <table className="data-table min-w-[860px]">
                                            <thead>
                                                <tr>
                                                    <th className="w-[15%]"><LabelText label="Name" docs={DOCS_PATHS.quantity} /></th>
                                                    <th className="w-[17%]">
                                                        <span className="flex items-center gap-1">
                                                            <DocsLabel label="Identifiers" />
                                                            <LookupButton busy={lookups[`tbl:${res.uuid}`]?.busy} onClick={() => lookUpTableIds(res.uuid)} label="Find the CAS number and InChIKey of every row in this table" />
                                                        </span>
                                                    </th>
                                                    <th className="w-[11%] text-right"><LabelText label="Value *" docs={DOCS_PATHS.values} /></th>
                                                    <th className="w-[11%] text-right"><LabelText label={uncRequired ? "Uncertainty *" : "Uncertainty"} /></th>
                                                    <th className="w-[9%]"><LabelText label="Unit" docs={DOCS_PATHS.unitStrings} /></th>
                                                    <th className="w-[17%]"><DocsLabel label="DSI Unit">D-SI unit</DocsLabel></th>
                                                    <th className="w-[7%] group">
                                                        <div className="flex items-center gap-1 relative">
                                                            <span title="Coverage factor k, e.g. 2"><DocsLabel label="k factor"><i>k</i></DocsLabel></span>
                                                            {res.coverageReasoning && (
                                                                <div className="relative">
                                                                    <span className="text-check cursor-help inline-flex" tabIndex={0} aria-label="How k and P were chosen"><Icon name="alert" size={13} /></span>
                                                                    <div className="absolute hidden group-hover:block group-focus-within:block z-50 bg-ink text-white text-xs rounded p-2.5 w-72 top-full mt-1 right-0 shadow-float font-normal whitespace-normal break-words pointer-events-none">
                                                                        <strong className="block font-semibold mb-1">How <i>k</i> and P were chosen</strong>
                                                                        {res.coverageReasoning}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th className="w-[10%] group">
                                                        <div className="flex items-center gap-1 relative">
                                                            <span title="Coverage probability P: 0.95 or 95 %"><DocsLabel label="Probability">P</DocsLabel></span>
                                                            {res.coverageReasoning && (
                                                                <div className="relative">
                                                                    <span className="text-check cursor-help inline-flex" tabIndex={0} aria-label="How k and P were chosen"><Icon name="alert" size={13} /></span>
                                                                    <div className="absolute hidden group-hover:block group-focus-within:block z-50 bg-ink text-white text-xs rounded p-2.5 w-72 top-full mt-1 right-0 shadow-float font-normal whitespace-normal break-words pointer-events-none">
                                                                        <strong className="block font-semibold mb-1">How <i>k</i> and P were chosen</strong>
                                                                        {res.coverageReasoning}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th className="w-[5%]"><span className="sr-only">Remove</span></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {res.quantities.map((q, qIdx) => { const unc = uncertaintyProblems(q); const pXml = toCoverageProbability(q.coverageProbability); return (
                                                    <React.Fragment key={q.uuid}>
                                                    <tr className="hover:bg-sunken/70 [&>td]:align-top">
                                                        <td className="p-1 relative">
                                                            <CellInput ariaLabel="Quantity name" value={q.name} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.name)} onChange={(val) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities[qIdx].name = val; setDrmdData(p => ({...p, properties: list})); }} />
                                                        </td>
                                                        <td className="p-1">
                                                            <div className="flex items-start gap-1">
                                                                <div className="flex-1 min-w-0 text-2xs text-ink-soft leading-[1.35] py-0.5 break-all">
                                                                    {(q.identifiers || []).filter((id: any) => id.scheme && id.value && id.value.trim() !== '').length > 0 
                                                                        ? (q.identifiers || []).filter((id: any) => id.scheme && id.value && id.value.trim() !== '').map((id: any, i: number) => (
                                                                            <div key={i}>
                                                                                <span className="text-ink-faint">{id.scheme}</span> {safeHttpUrl(id.link) ? <a href={safeHttpUrl(id.link)} target="_blank" rel="noopener noreferrer" className="text-petrol-600 hover:underline">{id.value}</a> : id.value}
                                                                            </div>
                                                                        ))
                                                                        : <span className="font-sans text-ink-faint">–</span>
                                                                    }
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingIdsFor(editingIdsFor === q.uuid ? null : q.uuid)}
                                                                    className={`icon-btn w-6 h-6 shrink-0 ${editingIdsFor === q.uuid ? 'bg-petrol-600/10 text-petrol-700' : ''}`}
                                                                    title="Edit identifiers"
                                                                    aria-label={`Edit identifiers of ${q.name || `row ${qIdx + 1}`}`}
                                                                    aria-expanded={editingIdsFor === q.uuid}
                                                                ><Icon name="edit" size={13} /></button>
                                                            </div>
                                                        </td>
                                                        <td className="p-1 relative group-td">
                                                            <CellInput ariaLabel="Value" align="right" value={q.value} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.name)} onChange={(val) => { 
                                                                    const list = [...drmdData.properties]; 
                                                                    list[pIdx].results[rIdx].quantities[qIdx].value = val; 
                                                                    // The D-SI value is the value itself (a D-SI unit never changes it)
                                                                    list[pIdx].results[rIdx].quantities[qIdx].dsiValue = convertToDSI(val, '\\one').dsiValue;
                                                                    setDrmdData(p => ({...p, properties: list})); 
                                                                }} />
                                                        </td>
                                                        <td className="p-1 relative">
                                                            <CellInput ariaLabel="Uncertainty" align="right" problem={unc.uncertainty} value={q.uncertainty} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.name)} onChange={(val) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities[qIdx].uncertainty = val; setDrmdData(p => ({...p, properties: list})); }} />
                                                        </td>
                                                        <td className="p-1 relative">
                                                            <CellInput ariaLabel="Unit" value={q.unit} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.name)} onChange={(val) => { 
                                                                    const list = [...drmdData.properties]; 
                                                                    const row = list[pIdx].results[rIdx].quantities[qIdx];
                                                                    // A changed unit is written in D-SI again at once, by the rules of the D-SI
                                                                    // guide with the row's context; a D-SI unit typed earlier gives way to it.
                                                                    const conv = dsiFor(val, { texts: unitContextTexts(row as any, res, prop, drmdData.statements?.official?.metrologicalTraceability) });
                                                                    list[pIdx].results[rIdx].quantities[qIdx] = { ...row, unit: val, dsiUnit: conv.dsi, dsiValue: convertToDSI(row.value, '\\one').dsiValue, dsiSource: 'rules', dsiNote: undefined };
                                                                    setDrmdData(p => ({...p, properties: list})); 
                                                                    if (val.trim() && (!conv.dsi || conv.ambiguous) && !conv.noAi) scheduleUnitAi(row.uuid); else cancelUnitAi(row.uuid);
                                                                }} />
                                                        </td>
                                                        <td className="p-1">
                                                            <DsiCell
                                                                unit={q.unit}
                                                                dsi={q.dsiUnit}
                                                                busy={!!unitBusy[q.uuid]}
                                                                onFocus={() => showDsiSource(q, res, prop)}
                                                                onChange={(val) => {
                                                                    const list = [...drmdData.properties];
                                                                    const row = list[pIdx].results[rIdx].quantities[qIdx];
                                                                    cancelUnitAi(row.uuid);
                                                                    list[pIdx].results[rIdx].quantities[qIdx] = { ...row, dsiUnit: val.replace(/\s+/g, ''), dsiSource: 'manual', dsiNote: undefined };
                                                                    setDrmdData(p => ({...p, properties: list}));
                                                                }}
                                                            />
                                                        </td>
                                                        <td className="p-1"><CellInput ariaLabel="Coverage factor k" align="right" problem={unc.k} placeholder={unc.k ? 'e.g. 2' : undefined} value={q.coverageFactor} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.name)} onChange={(val) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities[qIdx].coverageFactor = val; setDrmdData(p => ({...p, properties: list})); }} /></td>
                                                        <td className="p-1"><CellInput ariaLabel="Coverage probability" align="right" problem={unc.p} placeholder={unc.p ? '0.95' : undefined} title={pXml ? `Written to the XML as ${pXml}` : 'Coverage probability P: 0.95 or 95 %'} value={q.coverageProbability} onFocus={() => handleHighlight(res.sectionCoordinates, null, res.name)} onChange={(val) => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities[qIdx].coverageProbability = val; setDrmdData(p => ({...p, properties: list})); }} /></td>
                                                        <td className="text-center"><button onClick={() => { const list = [...drmdData.properties]; list[pIdx].results[rIdx].quantities.splice(qIdx, 1); setDrmdData(p => ({...p, properties: list})); }} className="icon-btn-danger w-6 h-6" title="Remove row" aria-label="Remove row"><Icon name="x" size={14} /></button></td>
                                                    </tr>
                                                    {editingIdsFor === q.uuid && (
                                                        <tr className="bg-sunken/60">
                                                            <td colSpan={9} className="px-3 py-3">
                                                                <div className="max-w-[640px]">
                                                                    <div className="flex items-baseline justify-between gap-3 mb-2">
                                                                        <span className="text-xs font-semibold text-ink">Identifiers of {q.name || `row ${qIdx + 1}`}</span>
                                                                        <button type="button" onClick={() => setEditingIdsFor(null)} className="btn-secondary btn-sm">Done</button>
                                                                    </div>
                                                                    <ChemIdEditor
                                                                        label={q.name || `Row ${qIdx + 1}`}
                                                                        ids={(q.identifiers || []).filter((id: any) => (id.scheme || '').trim() || (id.value || '').trim())}
                                                                        emptyText="None yet. Add one if this row has an identifier."
                                                                        autoFocus
                                                                        onChange={(next) => {
                                                                            const list = [...drmdData.properties];
                                                                            list[pIdx].results[rIdx].quantities[qIdx] = { ...list[pIdx].results[rIdx].quantities[qIdx], identifiers: next, identifiersEdited: true };
                                                                            setDrmdData(p => ({...p, properties: list}));
                                                                        }}
                                                                    />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    </React.Fragment>
                                                ); })}
                                            </tbody>
                                        </table>
                                        <div className="px-2 py-1.5 border-t border-line-soft flex items-center justify-between gap-x-4 gap-y-1 flex-wrap">
                                            <button onClick={() => { 
                                                const list = [...drmdData.properties]; 
                                                list[pIdx].results[rIdx].quantities.push({ ...INITIAL_QUANTITY, uuid: generateUUID(), identifiers: [] });
                                                setDrmdData(p => ({...p, properties: list}));
                                            }} className="btn-link text-xs"><Icon name="plus" size={13} /> Add row</button>
                                            <LookupNote state={lookups[`tbl:${res.uuid}`]} className="!mt-0 text-right" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button 
                                onClick={() => {
                                    const list = [...drmdData.properties];
                                    list[pIdx].results.push({
                                        uuid: generateUUID(),
                                        name: "",
                                        description: "",
                                        quantities: [{ ...INITIAL_QUANTITY, uuid: generateUUID(), identifiers: [] }]
                                    });
                                    setDrmdData(p => ({...p, properties: list}));
                                }}
                                className="w-full h-9 rounded-md border border-dashed border-line-strong text-sm font-medium text-ink-soft hover:border-petrol-500 hover:text-petrol-700 hover:bg-petrol-50/50 transition-colors inline-flex items-center justify-center gap-1.5"
                            >
                                <Icon name="plus" size={14} /> Add table
                            </button>
                        </div>
                   </div>
              </div>
              );
          })}
      </div>
  );

  const renderStatements = () => (
      <div>
          <SectionHeader title="Statements" level="page" docs={DOCS_PATHS.statements} />
          <div className="section">
          <SectionHeader title="ISO 17034 statements" docs={DOCS_PATHS.standardStatements} />
          <p className="section-lede">The standard statements ISO 17034 expects on a reference material certificate.</p>
          <div className="space-y-4">

          <TextArea label="Intended use *" value={drmdData.statements.official.intendedUse} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, intendedUse: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.intendedUse, null, drmdData.statements.official.intendedUse, drmdData.statements.official.originalTexts?.intendedUse)} source={drmdData.statements.official.originalTexts?.intendedUse} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.intendedUse, null, drmdData.statements.official.intendedUse, drmdData.statements.official.originalTexts?.intendedUse)} />
          <TextArea label="Commutability" value={drmdData.statements.official.commutability} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, commutability: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.commutability, null, drmdData.statements.official.commutability, drmdData.statements.official.originalTexts?.commutability)} source={drmdData.statements.official.originalTexts?.commutability} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.commutability, null, drmdData.statements.official.commutability, drmdData.statements.official.originalTexts?.commutability)} />
          <TextArea label="Storage information *" value={drmdData.statements.official.storageInformation} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, storageInformation: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.storageInformation, null, drmdData.statements.official.storageInformation, drmdData.statements.official.originalTexts?.storageInformation)} source={drmdData.statements.official.originalTexts?.storageInformation} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.storageInformation, null, drmdData.statements.official.storageInformation, drmdData.statements.official.originalTexts?.storageInformation)} />
          <TextArea label="Instructions for handling and use *" value={drmdData.statements.official.handlingInstructions} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, handlingInstructions: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.handlingInstructions, null, drmdData.statements.official.handlingInstructions, drmdData.statements.official.originalTexts?.handlingInstructions)} source={drmdData.statements.official.originalTexts?.handlingInstructions} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.handlingInstructions, null, drmdData.statements.official.handlingInstructions, drmdData.statements.official.originalTexts?.handlingInstructions)} />
          <TextArea label={drmdData.administrativeData.title === "referenceMaterialCertificate" ? "Metrological traceability *" : "Metrological traceability"} value={drmdData.statements.official.metrologicalTraceability} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, metrologicalTraceability: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.metrologicalTraceability, null, drmdData.statements.official.metrologicalTraceability, drmdData.statements.official.originalTexts?.metrologicalTraceability)} source={drmdData.statements.official.originalTexts?.metrologicalTraceability} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.metrologicalTraceability, null, drmdData.statements.official.metrologicalTraceability, drmdData.statements.official.originalTexts?.metrologicalTraceability)} />
          <TextArea label="Health and safety information" value={drmdData.statements.official.healthAndSafety} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, healthAndSafety: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.healthAndSafety, null, drmdData.statements.official.healthAndSafety, drmdData.statements.official.originalTexts?.healthAndSafety)} source={drmdData.statements.official.originalTexts?.healthAndSafety} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.healthAndSafety, null, drmdData.statements.official.healthAndSafety, drmdData.statements.official.originalTexts?.healthAndSafety)} />
          <TextArea label="Subcontractors" value={drmdData.statements.official.subcontractors} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, subcontractors: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.subcontractors, null, drmdData.statements.official.subcontractors, drmdData.statements.official.originalTexts?.subcontractors)} source={drmdData.statements.official.originalTexts?.subcontractors} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.subcontractors, null, drmdData.statements.official.subcontractors, drmdData.statements.official.originalTexts?.subcontractors)} />
          <TextArea label="Legal notice" value={drmdData.statements.official.legalNotice} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, legalNotice: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.legalNotice, null, drmdData.statements.official.legalNotice, drmdData.statements.official.originalTexts?.legalNotice)} source={drmdData.statements.official.originalTexts?.legalNotice} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.legalNotice, null, drmdData.statements.official.legalNotice, drmdData.statements.official.originalTexts?.legalNotice)} />
          <TextArea label="Reference to certification report" value={drmdData.statements.official.referenceToCertificationReport} onChange={(v) => setDrmdData(p => ({...p, statements: {...p.statements, official: {...p.statements.official, referenceToCertificationReport: v}}}))} onFocus={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.referenceToCertificationReport, null, drmdData.statements.official.referenceToCertificationReport, drmdData.statements.official.originalTexts?.referenceToCertificationReport)} source={drmdData.statements.official.originalTexts?.referenceToCertificationReport} onInfoClick={() => handleHighlight(drmdData.statements.official.fieldCoordinates?.referenceToCertificationReport, null, drmdData.statements.official.referenceToCertificationReport, drmdData.statements.official.originalTexts?.referenceToCertificationReport)} />
          </div>
          </div>

          <div className="section">
          <SectionHeader
              title="Other statements"
              docs={DOCS_PATHS.customStatement}
              action={<button onClick={() => setDrmdData(p => ({...p, statements: {...p.statements, custom: [...p.statements.custom, { uuid: generateUUID(), name: "", content: "" }]}}))} className="btn-quiet btn-sm"><Icon name="plus" size={14} /> Add statement</button>}
          />
          <p className="section-lede">Anything else the certificate states that does not fit the standard statements above.</p>
          {drmdData.statements.custom.length === 0 && <p className="hint">None added.</p>}
          {drmdData.statements.custom.map((st, idx) => (
              <div key={st.uuid} className="entry">
                  <div className="entry-head">
                      <span className="entry-title">Statement {idx + 1}</span>
                      <button onClick={() => { const list = [...drmdData.statements.custom]; list.splice(idx, 1); setDrmdData(p => ({...p, statements: {...p.statements, custom: list}})); }} className="icon-btn-danger" title="Remove statement" aria-label="Remove statement"><Icon name="trash" /></button>
                  </div>
                  <div className="space-y-3">
                      <Input label="Statement name" value={st.name} onChange={(v) => { const list = [...drmdData.statements.custom]; list[idx].name = v; setDrmdData(p => ({...p, statements: {...p.statements, custom: list}})); }} onInfoClick={() => handleHighlight(st.name)} />
                      <TextArea label="Content" value={st.content} docs={DOCS_PATHS.customStatement} onChange={(v) => { const list = [...drmdData.statements.custom]; list[idx].content = v; setDrmdData(p => ({...p, statements: {...p.statements, custom: list}})); }} onInfoClick={() => handleHighlight(st.content)} />
                  </div>
              </div>
          ))}
          </div>
      </div>
  );

  const renderCommentAndDocument = () => {
    const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            e.target.value = '';
            if (file.size > 200 * 1024 * 1024) {
                setError(`${file.name} is larger than 200 MB and cannot be attached.`);
                return;
            }
            const allowedTypes = ['application/pdf'];
            const allowedExts = ['pdf'];
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext || '')) {
                setError(`${file.name} is not a PDF. Only PDF documents can be attached.`);
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string | null;
                const base64Data = base64String?.split(',')[1];
                if (!base64Data) { setError(`Could not read ${file.name}. Please try again.`); return; }
                const docs = drmdDataRef.current.binaryDocuments || [];
                // The first PDF attached to a document without a human-readable PDF becomes that PDF and is shown.
                updateDocuments([...docs, {
                    fileName: file.name,
                    // Only PDFs are accepted (checked above), also when the browser reports no type.
                    mimeType: "application/pdf",
                    data: base64Data,
                    ...(docs.some(d => d.rmDocument) ? {} : { rmDocument: true }),
                }]);
            };
            reader.readAsDataURL(file);
        }
    };
    const removeDocument = (idx: number) => updateDocuments((drmdDataRef.current.binaryDocuments || []).filter((_, i) => i !== idx));
    const markRmDocument = (idx: number) => updateDocuments((drmdDataRef.current.binaryDocuments || []).map((d, i) => {
        const { rmDocument: _was, ...rest } = d;
        return i === idx ? { ...rest, rmDocument: true } : rest;
    }));
    const rmLabel = rmDocumentName(drmdData.administrativeData.title);
    const rmLabelLower = rmLabel.replace(/^H/, 'h'); // "human-readable PDF certificate"

    return (
      <div>
          <SectionHeader title="Comment & documents" level="page" docs={DOCS_PATHS.commentsDocuments} />

          <div className="section">
              <SectionHeader title="Comment" docs={DOCS_PATHS.comment} />
              <textarea
                  className="field-control min-h-[120px]"
                  placeholder="A general comment on this document (optional)"
                  aria-label="Comment"
                  value={drmdData.generalComment}
                  onChange={(e) => setDrmdData(p => ({...p, generalComment: e.target.value}))}
              />
          </div>

          <div className="section">
              <SectionHeader title="Attached documents" docs={DOCS_PATHS.document} />
              <p className="section-lede">
                  Embedded in the XML. The {rmLabelLower} is shown on the left and written first in the XML, under that name.
                  A PDF that was converted with AI is attached automatically.
              </p>

              {drmdData.binaryDocuments && drmdData.binaryDocuments.length > 0 && (
                  <ul className="panel divide-y divide-line-soft mb-4" data-testid="attached-documents">
                      {drmdData.binaryDocuments.map((doc, idx) => (
                          <li key={idx} className="flex items-center gap-3 px-4 py-2.5" data-rm-document={doc.rmDocument ? 'true' : undefined}>
                              <Icon name="file" className={doc.rmDocument ? 'text-petrol-600' : 'text-ink-muted'} />
                              <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate" title={doc.fileName}>{doc.fileName}</p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      {doc.rmDocument
                                          ? <span className="tag-active" title="Shown on the left; written first in the XML, with this name">{rmLabel}</span>
                                          : doc.name ? <span className="text-xs text-ink-soft truncate">{doc.name}</span> : null}
                                      <span className="hint">{doc.mimeType || 'Document'}{doc.data ? ` · ${(Math.ceil(doc.data.length * 3 / 4) / 1024 / 1024).toFixed(2)} MB` : ''}</span>
                                  </p>
                              </div>
                              {!doc.rmDocument && isPdfDocument(doc) && (
                                  <button onClick={() => markRmDocument(idx)} className="btn-quiet btn-sm" title={`Mark this PDF as the ${rmLabelLower} and show it on the left`}>
                                      Mark as {rmLabelLower}
                                  </button>
                              )}
                              <button
                                  onClick={() => removeDocument(idx)}
                                  className="icon-btn-danger"
                                  title="Remove document"
                                  aria-label={`Remove ${doc.fileName}`}
                              >
                                  <Icon name="trash" />
                              </button>
                          </li>
                      ))}
                  </ul>
              )}

              <label
                  htmlFor="doc-upload"
                  className="flex items-center gap-4 rounded-md border border-dashed border-line-strong px-5 py-4 cursor-pointer hover:border-petrol-500 hover:bg-petrol-50/40 transition-colors"
              >
                  <Icon name="upload" size={20} className="text-ink-muted" />
                  <span className="flex-1">
                      <span className="block text-sm font-medium">Attach a PDF</span>
                      <span className="hint">Up to 200 MB per file</span>
                  </span>
                  <span className="btn-secondary btn-sm">Choose file</span>
              </label>
              <input
                  type="file"
                  id="doc-upload"
                  className="hidden"
                  accept=".pdf,application/pdf"
                  onChange={handleDocUpload}
              />
          </div>
      </div>
    );
  };

  const renderValidateExport = () => {
    const { errors, conditionalErrors, warnings, isCompliant: isValid } = validateDrmd(drmdData);
    // The XML and the HTML report are built for viewing only while their panel is open.
    const xmlPreview = xmlOpen ? generateDrmdXml(drmdData) : '';
    const htmlPreview = htmlOpen ? generateHtmlReport(drmdData) : '';

    const handleHtmlExport = () => {
        const blob = new Blob([generateHtmlReport(drmdData)], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${getExportFilename()}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const doneCount = bulkResults.filter(r => r.status === 'done').length;
    const errorCount = bulkResults.filter(r => r.status === 'error').length;
    const totalCount = bulkResults.length;
    const pendingCount = bulkResults.filter(r => r.status === 'pending').length;
    const incompleteCount = bulkResults.filter(r => r.status === 'done' && !!r.incomplete?.length).length;
    const savedEarlierCount = bulkResults.filter(r => r.savedEarlier).length;
    const notSavedCount = bulkResults.filter(r => r.status === 'done' && !!r.saveError).length;
    const retryableCount = errorCount + pendingCount + incompleteCount;
    const progressPercent = bulkProcessing
        ? (bulkProgress.total > 0 ? Math.round((bulkProgress.current / bulkProgress.total) * 100) : 0)
        : (totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0);

    const isBlankDoc = drmdData === blankDocRef.current;
    const severityRow = (kind: 'error' | 'check' | 'note', item: { ruleId: string; section: string; message: string }, key: string) => (
        <li key={key} className="grid grid-cols-[64px_1fr] gap-3 px-4 py-2.5">
            <span className={kind === 'error' ? 'tag-bad justify-center' : kind === 'check' ? 'tag-check justify-center' : 'tag-neutral justify-center'}>
                {kind === 'error' ? 'Error' : kind === 'check' ? 'Check' : 'Note'}
            </span>
            <div className="min-w-0">
                <p className="text-sm text-ink">{italicK(item.message)}</p>
                <p className="mt-0.5 text-2xs text-ink-muted"><span className="tabular-nums">{item.ruleId}</span> · {item.section}</p>
            </div>
        </li>
    );

    return (
        <div>
            <SectionHeader title="Validate & export" level="page" docs={DOCS_PATHS.validationRules} />

            {/* ───────────── folder results ───────────── */}
            {(bulkResults.length > 0 || bulkProcessing) && (
                <div className="section">
                    <SectionHeader
                        title="Folder results"
                        action={!bulkProcessing && (doneCount > 0 || retryableCount > 0) ? (
                            <div className="flex gap-2">
                                {retryableCount > 0 && (
                                    <button
                                        onClick={handleBulkRetryFailed}
                                        title="Process again only the certificates that failed, came back incomplete, or were not reached"
                                        className="btn-secondary btn-sm"
                                    >
                                        <Icon name="refresh" size={14} /> Retry {retryableCount} failed or incomplete
                                    </button>
                                )}
                                {doneCount > 0 && !bulkFolderName && (
                                    <button
                                        onClick={handleBulkDownloadAll}
                                        disabled={bulkProcessing || doneCount === 0}
                                        className="btn-primary btn-sm"
                                        title="One ZIP with an XML file and an HTML report per certificate"
                                    >
                                        <Icon name="archive" size={14} /> Download all as ZIP
                                    </button>
                                )}
                            </div>
                        ) : undefined}
                    />

                    {bulkFolderName && (
                        <p className="section-lede">
                            Saving into folder <span className="font-medium text-ink">{bulkFolderName}</span>: XML and HTML files for all extracted PDFs.
                            PDFs that already have been extracted are skipped; if you wish, you can delete an XML file to have the PDF extracted again.
                        </p>
                    )}
                    {totalCount > 0 && !bulkProcessing && doneCount > 0 && (
                        <p className="section-lede">Click a row to see the validation report of that certificate below; Review opens it in the form next to its PDF.</p>
                    )}
                    <div className="mb-4">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                            <span className="font-medium text-ink">
                                {bulkProcessing
                                    ? `File ${bulkProgress.current} of ${bulkProgress.total}`
                                    : `${doneCount - incompleteCount} of ${totalCount} complete`}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-ink-soft"><span className="dot bg-ok" />{doneCount - incompleteCount - savedEarlierCount} done</span>
                            {savedEarlierCount > 0 && <span className="inline-flex items-center gap-1.5 text-ink-soft"><span className="dot bg-ok/50" />{savedEarlierCount} saved earlier</span>}
                            {notSavedCount > 0 && <span className="inline-flex items-center gap-1.5 text-bad"><span className="dot bg-bad" />{notSavedCount} not saved to the folder</span>}
                            {incompleteCount > 0 && <span className="inline-flex items-center gap-1.5 text-ink-soft"><span className="dot bg-check" />{incompleteCount} incomplete</span>}
                            {errorCount > 0 && <span className="inline-flex items-center gap-1.5 text-ink-soft"><span className="dot bg-bad" />{errorCount} failed</span>}
                            {pendingCount > 0 && <span className="inline-flex items-center gap-1.5 text-ink-soft"><span className="dot bg-line-strong" />{pendingCount} waiting</span>}
                            <span className="ml-auto tabular-nums text-ink-muted">{progressPercent}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-line-soft overflow-hidden">
                            <div className={`h-full transition-[width] duration-500 ${bulkProcessing ? 'bg-petrol-600' : 'bg-ok'}`} style={{ width: `${progressPercent}%` }} />
                        </div>
                        {bulkProcessing && (
                            <div className="mt-2 flex items-center gap-3">
                                <p className="flex-1 min-w-0 text-xs text-ink-muted truncate" title={statusMessage}>{statusMessage || (bulkProgress.currentFile ? `Working on ${bulkProgress.currentFile}` : '')}</p>
                                <button onClick={() => { bulkCancelRef.current = true; }} className="btn-quiet btn-sm text-bad hover:bg-bad-bg hover:text-bad">
                                    <Icon name="stop" size={14} /> Stop after this file
                                </button>
                            </div>
                        )}
                    </div>

                    {totalCount > 0 && (
                        <div className="panel overflow-x-auto relative">
                            <table className="data-table min-w-[760px]">
                                <thead>
                                    <tr>
                                        <th className="w-10 text-right">#</th>
                                        <th><DocsLabel label="RM Code" /></th>
                                        <th><DocsLabel label="Material Name" docs={DOCS_PATHS.materialName}>Material</DocsLabel></th>
                                        <th>File</th>
                                        <th>Status</th>
                                        <th className="text-right"><span className="sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bulkResults.map((result, idx) => {
                                        const isOpen = result.id === reviewingBulkId;
                                        // A finished row: clicking it (anywhere but its buttons) shows its validation report.
                                        const canShow = result.status === 'done' && !bulkProcessing;
                                        const onRow = (e: React.MouseEvent | React.KeyboardEvent) => {
                                            if (!canShow || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
                                            if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
                                            e.preventDefault();
                                            void showRowReport(result);
                                        };
                                        return (
                                        <tr key={result.id}
                                            className={`${isOpen ? 'bg-petrol-50' : 'hover:bg-sunken/70'} ${canShow ? 'cursor-pointer' : ''}`}
                                            onClick={onRow} onKeyDown={onRow} tabIndex={canShow ? 0 : undefined}
                                            data-row-file={result.fileName}
                                            title={canShow ? 'Show the validation report of this certificate' : undefined}>
                                            <td className="py-2 text-right text-ink-faint tabular-nums text-xs">{idx + 1}</td>
                                            <td className="py-2 font-medium text-sm tabular-nums whitespace-nowrap">{result.rmCode || <span className="font-sans text-ink-faint">–</span>}</td>
                                            <td className="py-2 max-w-[220px] truncate" title={result.rmName}>{result.rmName || <span className="text-ink-faint">–</span>}</td>
                                            <td className="py-2 max-w-[200px] truncate text-xs text-ink-muted" title={result.filePath || result.fileName}>{result.filePath || result.fileName}</td>
                                            <td className="py-2">
                                                {result.status === 'pending' && <span className="tag-neutral">Waiting</span>}
                                                {result.savedEarlier && !result.loaded && <span className="tag-neutral" title={`${result.savedAs} already existed, so this PDF was not extracted again`}><Icon name="check" size={12} /> Saved earlier</span>}
                                                {result.status === 'done' && !!result.saveError && <span className="tag-bad mr-1" title={result.saveError}>Not saved</span>}
                                                {result.status === 'processing' && <span className="tag-active"><Spinner size={10} /> Extracting</span>}
                                                {result.status === 'done' && !result.incomplete?.length && result.validation && !(result.savedEarlier && !result.loaded) && (
                                                    result.validation.errors > 0
                                                        ? <span className="tag-bad" title="Open it with Review to see and fix the errors">{result.validation.errors} error{result.validation.errors === 1 ? '' : 's'}</span>
                                                        : result.validation.conditionalErrors > 0
                                                            ? <span className="tag-ok" title="Valid. Some conditional rules may apply to this material: check them in Review.">Valid · {result.validation.conditionalErrors} to check</span>
                                                            : <span className="tag-ok"><Icon name="check" size={12} /> Valid</span>
                                                )}
                                                {result.status === 'done' && !result.incomplete?.length && !result.validation && !result.savedEarlier && <span className="tag-ok">Done</span>}
                                                {result.status === 'done' && !!result.incomplete?.length && (
                                                    <span className="tag-check max-w-[220px]" title={`The model's answer was still missing ${result.incomplete.join(', ')} after asking again. Retry it, or review and complete it by hand.`}>
                                                        <span className="truncate">Incomplete: no {result.incomplete.join(', ')}</span>
                                                    </span>
                                                )}
                                                {result.status === 'error' && (
                                                    <span className="tag-bad max-w-[260px]" title={result.errorMessage}><span className="truncate">Failed: {result.errorMessage}</span></span>
                                                )}
                                            </td>
                                            <td className="py-1.5 text-right whitespace-nowrap">
                                                {result.status === 'done' && !bulkProcessing && (
                                                    <div className="inline-flex items-center gap-0.5">
                                                        <button onClick={() => handleBulkReview(result)} className={isOpen ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} title="Open in the form and the PDF viewer">
                                                            {isOpen ? 'Open' : 'Review'}
                                                        </button>
                                                        {(!bulkFolderName || !!result.saveError) && <>
                                                            <button onClick={() => handleBulkDownloadSingle(result)} className="btn-quiet btn-sm" title="Download DRMD XML"><Icon name="download" size={14} /> XML</button>
                                                            <button onClick={() => handleBulkDownloadSingleHtml(result)} className="btn-quiet btn-sm" title="Download HTML report"><Icon name="download" size={14} /> Report</button>
                                                        </>}
                                                        {!(result.savedEarlier && !result.loaded) && (
                                                            <button onClick={() => handleBulkReviewHtml(result)} className="icon-btn" title="Preview HTML report in a new tab" aria-label="Preview HTML report"><Icon name="eye" /></button>
                                                        )}
                                                    </div>
                                                )}
                                                {result.status === 'done' && bulkProcessing && <span className="hint">Available when the run ends</span>}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!bulkProcessing && errorCount > 0 && (
                        <div className="mt-4 rounded-md border border-bad-line bg-bad-bg/60 px-4 py-3">
                            <h4 className="text-sm font-semibold text-bad mb-1.5">Why {errorCount === 1 ? 'one file' : `${errorCount} files`} failed</h4>
                            <ul className="space-y-1">
                                {bulkResults.filter(r => r.status === 'error').map((r) => (
                                    <li key={r.id} className="text-xs text-ink-soft"><span className="font-medium text-ink">{r.fileName}</span>: {r.errorMessage}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* ───────────── the document in the form ───────────── */}
            {isBlankDoc ? (
                <div className="section">
                    <SectionHeader title="This document" />
                    <div className="rounded-md border border-dashed border-line-strong px-6 py-8 text-center">
                        <p className="text-md font-medium">The form is empty</p>
                        <p className="mt-1 text-sm text-ink-muted max-w-[56ch] mx-auto">
                            {bulkResults.length > 0
                                ? 'Choose Review on a row above to check a certificate against its PDF and correct it.'
                                : 'Upload a PDF or import a DRMD XML file, or fill in the form by hand. The validation report appears here.'}
                        </p>
                    </div>
                </div>
            ) : (
            <div className="section scroll-mt-4" id="this-document" data-testid="this-document">
                <SectionHeader title={reviewIndex >= 0 ? `This document (${reviewList[reviewIndex]?.rmCode || reviewList[reviewIndex]?.fileName || 'from the folder'})` : 'This document'} />

                {/* (a) Validation report */}
                <div className="panel overflow-hidden" data-testid="validation-report">
                    <div className="panel-head">
                        <span>Validation report</span>
                        <span className="text-xs font-normal text-ink-muted tabular-nums">{errors.length} error{errors.length === 1 ? '' : 's'} · {conditionalErrors.length} to check · {warnings.length} note{warnings.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className={`px-4 py-3.5 flex items-center gap-x-4 gap-y-3 border-b ${isValid ? 'border-ok-line bg-ok-bg' : 'border-bad-line bg-bad-bg'}`}>
                        <span className={`inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-full ${isValid ? 'bg-ok text-white' : 'bg-bad text-white'}`}>
                            <Icon name={isValid ? 'check' : 'alert'} size={17} strokeWidth={2.2} />
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="text-md font-semibold text-ink">
                                {isValid ? 'Ready to export' : `${errors.length} error${errors.length === 1 ? '' : 's'} to fix before export`}
                            </p>
                            <p className="text-sm text-ink-soft">
                                {isValid
                                    ? 'The XML meets the DRMD 1.0.0 schema and the official business rules.'
                                    : 'The XML would not meet the DRMD 1.0.0 schema or the official business rules. The list below says where.'}
                                {conditionalErrors.length > 0 && ` ${conditionalErrors.length} conditional rule${conditionalErrors.length === 1 ? '' : 's'} to check.`}
                            </p>
                        </div>
                    </div>
                    {pendingChecks.total > 0 && (
                        <div className="flex items-center gap-3 border-b border-check-line bg-check-bg px-4 py-2.5 text-sm">
                            <Icon name="square" className="text-check shrink-0" />
                            <span className="flex-1 text-ink">
                                {pendingChecks.total} extracted value{pendingChecks.total === 1 ? ' does' : 's do'} not appear word for word in the PDF and {pendingChecks.total === 1 ? 'is' : 'are'} not verified yet.
                                They are outlined in amber: compare each with the certificate and mark it as verified.
                            </span>
                            {firstTabToCheck && <button onClick={() => setActiveTab(firstTabToCheck)} className="btn-secondary btn-sm">Show</button>}
                        </div>
                    )}
                    {errors.length === 0 && conditionalErrors.length === 0 && warnings.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-ink-muted">No findings.</p>
                    ) : (
                        <ul className="divide-y divide-line-soft max-h-[420px] overflow-y-auto relative">
                            {errors.map((err, idx) => severityRow('error', err, `err-${idx}`))}
                            {conditionalErrors.map((err, idx) => severityRow('check', err, `cerr-${idx}`))}
                            {warnings.map((warn, idx) => severityRow('note', warn, `warn-${idx}`))}
                        </ul>
                    )}
                    <p className="px-4 py-2 border-t border-line-soft hint">
                        <span className="font-medium text-ink-soft">Check</span> marks a conditional rule: it applies only if the certificate covers that case.
                    </p>
                </div>

                {/* (b) XML: view / save */}
                <div className="mt-4 panel overflow-hidden" data-testid="xml-panel">
                    <div className="panel-head">
                        <button type="button" onClick={() => setXmlOpen(o => !o)} aria-expanded={xmlOpen} aria-controls="xml-view" className="inline-flex items-center gap-2 -ml-1 px-1 h-8 rounded hover:bg-line-soft">
                            <Icon name="chevronRight" size={14} className={`text-ink-muted transition-transform ${xmlOpen ? 'rotate-90' : ''}`} /> DRMD XML
                        </button>
                        <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setXmlOpen(o => !o)} aria-expanded={xmlOpen} className="btn-quiet btn-sm"><Icon name="eye" size={14} /> {xmlOpen ? 'Hide' : 'View'}</button>
                            {xmlOpen && <button onClick={() => { navigator.clipboard?.writeText(xmlPreview).then(() => showToast('XML copied to the clipboard.', 'converted')).catch(() => setError('The browser did not allow copying. Select the text and press Ctrl+C instead.')); }} className="btn-quiet btn-sm"><Icon name="copy" size={14} /> Copy</button>}
                            {isValid
                                ? <button onClick={handleExport} className="btn-primary btn-sm" title="Save the DRMD XML"><Icon name="download" size={14} /> Save XML</button>
                                : <button onClick={handleExport} className="btn-secondary btn-sm" title="The file will not pass DRMD validation until the errors are fixed. Import it again later to finish it."><Icon name="download" size={14} /> Save XML (with errors)</button>}
                        </div>
                    </div>
                    {xmlOpen && (
                        <textarea
                            id="xml-view"
                            readOnly
                            value={xmlPreview}
                            aria-label="XML preview"
                            spellCheck={false}
                            wrap="off"
                            className="block h-[480px] w-full p-4 bg-sunken text-ink-soft font-mono text-xs leading-[1.55] resize-y outline-none border-0"
                        />
                    )}
                </div>

                {/* (c) HTML report: view / save */}
                <div className="mt-4 panel overflow-hidden" data-testid="html-panel">
                    <div className="panel-head">
                        <button type="button" onClick={() => setHtmlOpen(o => !o)} aria-expanded={htmlOpen} aria-controls="html-view" className="inline-flex items-center gap-2 -ml-1 px-1 h-8 rounded hover:bg-line-soft">
                            <Icon name="chevronRight" size={14} className={`text-ink-muted transition-transform ${htmlOpen ? 'rotate-90' : ''}`} /> HTML report
                        </button>
                        <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setHtmlOpen(o => !o)} aria-expanded={htmlOpen} className="btn-quiet btn-sm"><Icon name="eye" size={14} /> {htmlOpen ? 'Hide' : 'View'}</button>
                            <button onClick={handleHtmlExport} className="btn-secondary btn-sm" title="Save the HTML report"><Icon name="download" size={14} /> Save HTML</button>
                        </div>
                    </div>
                    {htmlOpen && (
                        <iframe
                            id="html-view"
                            srcDoc={htmlPreview}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            title="HTML report preview"
                            className="block w-full h-[720px] border-0 bg-white"
                        />
                    )}
                </div>

                <details className="mt-5 panel group">
                    <summary className="flex items-center gap-2 px-4 h-11 text-sm font-semibold cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                        <Icon name="chevronRight" size={14} className="text-ink-muted transition-transform group-open:rotate-90" />
                        Upload to the COMAR database
                    </summary>
                    <div className="px-4 pb-4 pt-1 border-t border-line-soft">
                        <ol className="list-decimal pl-5 space-y-1 text-sm text-ink-soft max-w-[68ch] mt-3">
                            <li>Save the DRMD XML and the HTML report above.</li>
                            <li>Sign in to COMAR and upload both files there.</li>
                        </ol>
                        <a
                            href="https://www.comar.bam.de/apex/f?p=1000:LOGIN:::NO:::"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary mt-4"
                        >
                            Open COMAR sign-in <Icon name="external" size={14} />
                        </a>
                    </div>
                </details>
            </div>
            )}
        </div>
    );
  };

  const getMergedBox = (boxes: (number[] | null | undefined)[]): number[] | null => {
      const valid = boxes.filter(b => Array.isArray(b) && b.length === 5 && b[3] > b[1] && b[4] > b[2]) as number[][];
      if (valid.length === 0) return null;
      const page = valid[0][0];
      const pageBoxes = valid.filter(b => b[0] === page);
      if (pageBoxes.length === 0) return null;
      const minY = Math.min(...pageBoxes.map(b => b[1]));
      const minX = Math.min(...pageBoxes.map(b => b[2]));
      const maxY = Math.max(...pageBoxes.map(b => b[3]));
      const maxX = Math.max(...pageBoxes.map(b => b[4]));
      return [page, Math.max(0, minY - 10), Math.max(0, minX - 10), Math.min(1000, maxY + 10), Math.min(1000, maxX + 10)];
  };

  // Live conformity summary for the status bar and the tab badge. Deferred so typing stays smooth.
  const deferredDoc = useDeferredValue(drmdData);
  const liveReport = useMemo(() => validateDrmd(deferredDoc), [deferredDoc]);
  const reviewList = bulkResults.filter(r => r.status === 'done');
  const reviewIndex = reviewingBulkId ? reviewList.findIndex(r => r.id === reviewingBulkId) : -1;
  const openReviewAt = (i: number) => { const r = reviewList[i]; if (r) handleBulkReview(r); };

  // `short` is shown when the window is too narrow for the full names.
  const TABS: { id: string; label: string; short: string }[] = [
      { id: 'admin', label: 'Administrative', short: 'Administrative' },
      { id: 'materials', label: 'Materials', short: 'Materials' },
      { id: 'properties', label: 'Properties', short: 'Properties' },
      { id: 'statements', label: 'Statements', short: 'Statements' },
      { id: 'comment-document', label: 'Comment & documents', short: 'Documents' },
      { id: 'validate-export', label: 'Validate & export', short: 'Validate & export' },
  ];
  const busy = isProcessing || bulkProcessing;
  // Extracted values not found word for word in the PDF and not yet confirmed, per tab.
  const pendingChecks = useMemo(() => {
      const byTab: Record<string, number> = {};
      const seen = new Set<string>();
      let total = 0;
      for (const item of collectVerifiable(deferredDoc)) {
          if (verifyApi.status(item.value, item.source) !== 'check') continue;
          const key = `${item.tab}|${verifyNorm(item.value)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          byTab[item.tab] = (byTab[item.tab] || 0) + 1;
          total++;
      }
      return { byTab, total };
  }, [deferredDoc, verifyApi]);
  const firstTabToCheck = TABS.find(t => pendingChecks.byTab[t.id])?.id;
  const isBlank = drmdData === blankDocRef.current;
  const pdfLink = useMemo(() => ({ hasPdf: !!pdfUrl, autoLocate: !!pdfUrl && isAiDoc }), [pdfUrl, isAiDoc]);
  const doneTotal = bulkResults.filter(r => r.status === 'done').length;
  const failedTotal = bulkResults.filter(r => r.status === 'error').length;
  const incompleteTotal = bulkResults.filter(r => r.status === 'done' && !!r.incomplete?.length).length;

  return (
    <div className="h-screen flex flex-col bg-canvas text-ink">
      <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
      <input type="file" accept=".xml,text/xml,application/xml" ref={xmlInputRef} onChange={handleXmlImport} className="hidden" />
      {/* @ts-ignore */}
      <input type="file" ref={bulkFolderInputRef} onChange={handleBulkUpload} className="hidden" multiple accept="application/pdf" webkitdirectory="" directory="" />

      <header className="shrink-0 h-14 bg-white border-b border-line flex items-center gap-4 px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink whitespace-nowrap">DRMD AI Generator</h1>
          <span className="inline-flex items-center h-5 px-1.5 rounded-sm border border-line text-2xs font-medium text-ink-muted tabular-nums" title="Version">v{__APP_VERSION__}</span>
        </div>
        <div className="flex-1" />
        <nav className="flex items-center gap-2" aria-label="Documents">
          <button onClick={requestNewDrmd} disabled={busy} className="btn-secondary" title="Clear the form and start a new DRMD" aria-label="New DRMD">
            <Icon name="plus" /> <span className="max-lg:hidden">New DRMD</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn-secondary" title="Convert one PDF (certificate or product information sheet) with AI" aria-label="Upload PDF">
            <Icon name="file" /> <span className="max-lg:hidden">Upload PDF</span>
          </button>
          <button onClick={handleOpenFolder} disabled={busy} className="btn-secondary" title={canWriteFolders ? "Convert every PDF in a folder with AI. The XML and HTML files are saved into the same folder." : "Convert every PDF in a folder with AI, one after another"} aria-label="Upload folder">
            <Icon name="folder" /> <span className="max-lg:hidden">Upload folder</span>
          </button>
          <button onClick={() => xmlInputRef.current?.click()} disabled={busy} className="btn-secondary" title="Open an existing DRMD XML file for editing" aria-label="Import XML">
            <Icon name="import" /> <span className="max-lg:hidden">Import XML</span>
          </button>
          <span className="w-px h-6 bg-line mx-1" aria-hidden="true" />
          <button onClick={() => setActiveTab('home')} aria-pressed={activeTab === 'home'} className={`btn-quiet ${activeTab === 'home' ? 'bg-line-soft text-ink' : ''}`} title="What the generator does" aria-label="Home">
            <Icon name="home" /> <span className="max-lg:hidden">Home</span>
          </button>
          <button onClick={() => setActiveTab('settings')} aria-pressed={activeTab === 'settings'} className={`btn-quiet relative ${activeTab === 'settings' ? 'bg-line-soft text-ink' : ''}`} title="AI provider and API key (only for AI conversion)" aria-label="AI settings">
            <Icon name="key" /> <span className="max-lg:hidden">AI settings</span>
          </button>
        </nav>
      </header>

      <div ref={splitContainerRef} className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* ---------------- certificate pane ---------------- */}
        <section
          aria-label="Certificate"
          data-enlarged={pdfEnlarged ? 'true' : undefined}
          className={pdfEnlarged
            ? 'fixed inset-0 z-[70] flex flex-col bg-desk'
            : 'relative flex flex-col bg-desk h-[46vh] md:h-auto shrink-0 md:w-[var(--split)] md:min-w-[260px]'}
          style={{ ['--split' as any]: `${splitRatio * 100}%` }}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {pendingUpload && (
            <div className="shrink-0 m-3 mb-0 rounded-md bg-white shadow-float px-3.5 py-2.5" role="status" aria-live="polite" data-testid="pending-upload">
              <div className="flex items-start gap-2.5">
                <Icon name="key" size={16} className="mt-0.5 shrink-0 text-petrol-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {pendingUpload.kind === 'pdf' ? pendingUpload.file.name : `${pendingUpload.label} (${pendingUpload.picked.length} PDF${pendingUpload.picked.length === 1 ? '' : 's'})`} is waiting for an API key
                  </p>
                  <p className="mt-0.5 text-sm text-ink-soft break-words">
                    {!conn.apiKey
                      ? <>Enter the API key for {providerLabel} in AI settings (or choose another provider there). The extraction starts by itself as soon as the key works.</>
                      : activeCheck?.busy ? <>Checking the key with {providerLabel}…</>
                      : activeCheck && !activeCheck.ok ? <>The key was not accepted: {activeCheck.msg} Correct it in AI settings; it is checked again.</>
                      : activeCheck?.ok && !(activeCheck.models?.length) ? <>{activeCheck.msg} Choose another provider in AI settings.</>
                      : <>Checking the key in a moment…</>}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={cancelPendingUpload} className="btn-secondary btn-sm">Cancel</button>
                <button onClick={startPendingUpload} disabled={!conn.apiKey} className="btn-primary btn-sm" title={conn.apiKey ? 'Start without waiting for the key check' : `Enter the API key for ${providerLabel} first`}>Start now</button>
              </div>
            </div>
          )}

          {pdfUrl ? (
            <PdfViewer
                url={pdfUrl}
                fileName={pdfName}
                highlightData={highlightData}
                onTextNotFound={handleTextNotFound}
                onAlternativeFound={handleAlternativeFound}
                onTextIndex={setPdfIndex}
                enlarged={pdfEnlarged}
                onToggleEnlarge={() => setPdfEnlarged(v => !v)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="w-full max-w-[320px] text-center">
                <div className="mx-auto mb-6 w-[150px] h-[200px] rounded-sm border border-dashed border-desk-line bg-desk-raised/40 flex flex-col gap-2.5 p-5" aria-hidden="true">
                  <span className="h-2 w-2/3 rounded-sm bg-desk-line" />
                  <span className="h-1.5 w-full rounded-sm bg-desk-line/70" />
                  <span className="h-1.5 w-5/6 rounded-sm bg-desk-line/70" />
                  <span className="mt-3 h-1.5 w-full rounded-sm bg-desk-line/50" />
                  <span className="h-1.5 w-full rounded-sm bg-desk-line/50" />
                  <span className="h-1.5 w-3/4 rounded-sm bg-desk-line/50" />
                </div>
                <p className="text-md font-medium text-white">No PDF shown</p>
                <p className="mt-1 text-sm text-desk-text">
                  Upload a PDF to convert it with AI, or a folder to convert many at once{canWriteFolders ? '; the results are saved into that folder' : ''}. You can also drop them here.
                  To enter a DRMD by hand, just fill in the form; a PDF attached on the Documents tab is shown here.
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <button onClick={() => fileInputRef.current?.click()} disabled={busy} className="btn bg-white border-white text-ink hover:bg-canvas"><Icon name="file" /> Upload PDF</button>
                  <button onClick={handleOpenFolder} disabled={busy} className="btn bg-transparent border-desk-line text-white hover:bg-desk-raised"><Icon name="folder" /> Upload folder</button>
                </div>
              </div>
            </div>
          )}

          {dropActive && (
            <div className="absolute inset-0 z-50 p-3 pointer-events-none" data-testid="drop-overlay">
              <div className="h-full rounded-md border-2 border-dashed border-white/70 bg-desk/90 flex items-center justify-center p-6 text-center">
                {busy ? (
                  <p className="text-md font-medium text-white">Please wait until the current {bulkProcessing ? 'folder' : 'certificate'} has finished</p>
                ) : (
                  <div>
                    <Icon name="file" size={28} className="mx-auto text-white" />
                    <p className="mt-3 text-md font-medium text-white">Drop to extract</p>
                    <p className="mt-1 text-sm text-desk-text">A PDF is extracted on its own; a folder or several PDFs are processed one after another.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="absolute inset-0 z-40 bg-desk/85 flex items-center justify-center p-6" role="status" aria-live="polite">
              <div className="w-full max-w-[380px] rounded-md bg-white shadow-float p-5">
                <div className="flex items-center gap-3">
                  <Spinner size={18} className="text-petrol-600" />
                  <p className="text-md font-semibold">{statusMessage.startsWith("Reading the XML") ? "Importing XML" : "Reading the certificate"}</p>
                  <span className="ml-auto text-sm tabular-nums text-ink-muted">{formatElapsed(elapsedSeconds)}</span>
                </div>
                <p className="mt-3 text-sm text-ink-soft min-h-[36px]">{statusMessage || 'Starting…'}</p>
                <p className="mt-3 pt-3 border-t border-line-soft hint">
                  Usually under a minute. Long certificates or busy servers can take a few minutes; the form fills in as soon as the data is back.
                </p>
              </div>
            </div>
          )}

          {bulkProcessing && (
            <div className="absolute inset-0 z-40 bg-desk/85 flex items-center justify-center p-6" role="status" aria-live="polite">
              <div className="w-full max-w-[420px] rounded-md bg-white shadow-float p-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-md font-semibold">Processing folder</p>
                  <p className="text-sm tabular-nums text-ink-muted">
                    <span className="text-ink font-semibold">{bulkProgress.current}</span> of {bulkProgress.total}
                  </p>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-line-soft overflow-hidden">
                  <div className="h-full bg-petrol-600 transition-[width] duration-500"
                       style={{ width: `${bulkProgress.total > 0 ? Math.round((bulkProgress.current / bulkProgress.total) * 100) : 0}%` }} />
                </div>
                {bulkProgress.currentFile && (
                  <p className="mt-3 text-sm text-ink-soft truncate" title={bulkProgress.currentFile}>{bulkProgress.currentFile}</p>
                )}
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className="inline-flex items-center gap-1.5"><span className="dot bg-ok" />{doneTotal - incompleteTotal} done</span>
                  {incompleteTotal > 0 && <span className="inline-flex items-center gap-1.5"><span className="dot bg-check" />{incompleteTotal} incomplete</span>}
                  {failedTotal > 0 && <span className="inline-flex items-center gap-1.5 text-bad"><span className="dot bg-bad" />{failedTotal} failed</span>}
                  <button onClick={() => { bulkCancelRef.current = true; }} className="ml-auto btn-secondary btn-sm">
                    <Icon name="stop" size={14} /> Stop after this file
                  </button>
                </div>
                <p className="mt-3 pt-3 border-t border-line-soft hint">
                  {bulkFolderName
                    ? <>Each result is saved into <span className="font-medium text-ink-soft">{bulkFolderName}</span> as it is ready. Should the run halt unexpectedly, simply upload the folder again. This is safe, as documents that have already been extracted are skipped.</>
                    : <>Results appear under Validate &amp; export as each file finishes. Keep this tab open until the run ends.</>}
                </p>
              </div>
            </div>
          )}

          {error && (
             <div className="absolute bottom-4 left-4 right-4 z-[60] rounded-md bg-white shadow-float border-l-[3px] border-bad px-4 py-3" role="alert">
                <div className="flex items-start gap-3">
                    <Icon name="alert" className="text-bad mt-0.5" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">Something needs your attention</p>
                        <p className="mt-0.5 text-sm text-ink-soft break-words">{error}</p>
                        <p className="mt-1 hint">Technical details are in the browser console (F12).</p>
                    </div>
                    <button onClick={() => setError(null)} className="icon-btn -mr-1 -mt-1" title="Dismiss" aria-label="Dismiss"><Icon name="x" /></button>
                </div>
             </div>
          )}

          {toastMessage && (
             <div ref={toastRef} data-testid="source-notice" data-position={toastAtTop ? 'top' : 'bottom'} className={`absolute ${toastAtTop ? 'top-14' : 'bottom-4'} left-1/2 -translate-x-1/2 z-50 w-[min(520px,calc(100%-2rem))] rounded-md bg-white shadow-float border-l-[3px] px-4 py-3 flex items-start gap-3 ${
                 toastType === 'converted' ? 'border-petrol-600' : toastType === 'generated' ? 'border-check' : 'border-note'
             }`} role="status">
                 <Icon name={toastType === 'converted' ? 'refresh' : 'alert'} className={`mt-0.5 ${toastType === 'converted' ? 'text-petrol-600' : 'text-check'}`} />
                 <span className="flex-1 text-sm text-ink">
                   {toastMessage}
                   {toastLink && safeHttpUrl(toastLink.href) && (
                     <> <a href={safeHttpUrl(toastLink.href)} target="_blank" rel="noopener noreferrer" className="text-petrol-600 underline underline-offset-2 hover:text-petrol-700">{toastLink.label}</a></>
                   )}
                 </span>
                 <button onClick={() => setToastMessage(null)} className="icon-btn -mr-1 -mt-1" title="Dismiss" aria-label="Dismiss"><Icon name="x" /></button>
             </div>
          )}
        </section>

        {/* ---------------- divider ---------------- */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize certificate pane"
          tabIndex={0}
          onPointerDown={startSplitDrag}
          onKeyDown={nudgeSplit}
          onDoubleClick={() => setSplitRatio(DEFAULT_SPLIT)}
          className="hidden md:block relative w-[5px] -mx-[2px] z-20 cursor-col-resize group shrink-0"
          title="Drag to resize. Double-click to reset."
        >
          <span className="absolute inset-y-0 left-[2px] w-px bg-line group-hover:bg-petrol-500 group-focus-visible:bg-petrol-600 transition-colors" />
        </div>

        {/* ---------------- record pane ---------------- */}
        <section aria-label="DRMD record" className="flex-1 min-w-0 min-h-0 flex flex-col bg-white">
          <div className="tabbar shrink-0" role="tablist">
            {TABS.map(tab => {
              const isValidate = tab.id === 'validate-export';
              const errs = liveReport.errors.length;
              return (
                <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className="tab" title={tab.label}>
                  <span className="hidden 2xl:inline">{tab.label}</span><span className="2xl:hidden" aria-hidden="true">{tab.short}</span>
                  {!!pendingChecks.byTab[tab.id] && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-check-bg text-check border border-check-line text-2xs font-semibold inline-flex items-center justify-center tabular-nums"
                          title={`${pendingChecks.byTab[tab.id]} value${pendingChecks.byTab[tab.id] === 1 ? '' : 's'} to verify against the PDF`}>{pendingChecks.byTab[tab.id]}</span>
                  )}
                  {isValidate && !isBlank && (
                    errs > 0
                      ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-2xs font-semibold inline-flex items-center justify-center tabular-nums" title={`${errs} error${errs === 1 ? '' : 's'}`}>{errs}</span>
                      : <Icon name="check" size={14} className="text-ok" />
                  )}
                </button>
              );
            })}
          </div>

          {reviewIndex >= 0 && (
            <div className="banner bg-petrol-50 border-petrol-100 text-petrol-900 items-center">
              <Icon name="folder" className="text-petrol-600 shrink-0" />
              <span className="flex-1 min-w-0 truncate">
                Reviewing <span className="font-semibold">{reviewList[reviewIndex].rmCode || reviewList[reviewIndex].fileName}</span>
                <span className="text-petrol-700"> · {reviewIndex + 1} of {reviewList.length} from the folder</span>
              </span>
              {bulkFolderName && (
                <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-petrol-700" role="status" title={reviewSave.message}>
                  {reviewSave.state === 'saving' || reviewSave.state === 'pending' ? <><Spinner size={10} /> Saving to folder</>
                    : reviewSave.state === 'saved' ? <><Icon name="check" size={13} /> Saved to folder</>
                    : reviewSave.state === 'error' ? <span className="text-bad inline-flex items-center gap-1"><Icon name="alert" size={13} /> Not saved</span>
                    : <>Edits are saved to the folder</>}
                </span>
              )}
              <button onClick={() => openReviewAt(reviewIndex - 1)} disabled={reviewIndex <= 0} className="btn-quiet btn-sm" title="Previous certificate"><Icon name="chevronLeft" size={14} /> Previous</button>
              <button onClick={() => openReviewAt(reviewIndex + 1)} disabled={reviewIndex >= reviewList.length - 1} className="btn-quiet btn-sm" title="Next certificate">Next <Icon name="chevronRight" size={14} /></button>
              <button onClick={() => setActiveTab('validate-export')} className="btn-secondary btn-sm">Back to list</button>
            </div>
          )}
          {extractionWarning && (
            <div className="banner bg-check-bg border-check-line text-ink" role="status">
              <Icon name="alert" className="text-check mt-0.5 shrink-0" />
              <span className="flex-1">{extractionWarning}</span>
              <button onClick={() => setExtractionWarning(null)} className="icon-btn -my-1" title="Dismiss" aria-label="Dismiss"><Icon name="x" /></button>
            </div>
          )}
          {identifierStatus && (
            <div className="banner bg-sunken border-line text-ink-soft items-center" role="status">
              <Spinner size={12} className="text-petrol-600 shrink-0" />
              <span className="truncate" title={identifierStatus}>
                {identifierStatus} You can review meanwhile.
              </span>
            </div>
          )}

          <VerifyContext.Provider value={verifyApi}>
          <PdfLinkContext.Provider value={pdfLink}>
          <div className="flex-1 min-h-0 overflow-y-auto relative">
            <div className="px-6 xl:px-8 py-6 pb-16">
              {['admin', 'materials', 'properties', 'statements'].includes(activeTab) && (pendingChecks.byTab[activeTab] || 0) > 0 && (
                  <div className="mb-5 flex items-start gap-3 rounded-md border border-check-line bg-check-bg px-4 py-2.5 text-sm" role="note">
                      <Icon name="square" className="text-check shrink-0 mt-0.5" />
                      <span className="text-ink">
                          <strong className="font-semibold">{pendingChecks.byTab[activeTab]} value{pendingChecks.byTab[activeTab] === 1 ? ' is' : 's are'} outlined in amber.</strong>{' '}
                          The generator could not find {pendingChecks.byTab[activeTab] === 1 ? 'it' : 'them'} word for word in the PDF text, so {pendingChecks.byTab[activeTab] === 1 ? 'it needs' : 'they need'} a quick look.
                          This also happens with correct values, for example when the PDF writes a number differently or the AI converted it.
                          Compare each one with the certificate and tick its box.
                      </span>
                  </div>
              )}
              {activeTab === 'home' && renderHome()}
              {activeTab === 'settings' && renderSettings()}
              {activeTab === 'admin' && renderAdmin()}
              {activeTab === 'materials' && renderMaterials()}
              {activeTab === 'properties' && renderProperties()}
              {activeTab === 'statements' && renderStatements()}
              {activeTab === 'comment-document' && renderCommentAndDocument()}
              {activeTab === 'validate-export' && renderValidateExport()}
            </div>
          </div>
          </PdfLinkContext.Provider>
          </VerifyContext.Provider>
        </section>
      </div>

      {droppedFolder && (
        <DroppedFolderDialog
          name={droppedFolder.root.name}
          count={droppedFolder.picked.length}
          withXml={droppedFolder.picked.filter(p => p.hasXml).length}
          onCancel={() => setDroppedFolder(null)}
          onSave={() => runDroppedFolder(true)}
          onKeep={() => { void runDroppedFolder(false); }}
        />
      )}

      {newDocAsk && (
        <ConfirmDialog
          title="Start a new DRMD?"
          confirmLabel="Clear and start new"
          onCancel={() => setNewDocAsk(false)}
          onConfirm={startNewDrmd}
        >
          The form and the PDF on the left are cleared. If you still need the current DRMD, save it first on Validate &amp; export.
          {bulkResults.length > 0 && ' The folder results stay in their list.'}
          {pendingUpload && ' The PDF waiting for an API key is dropped.'}
        </ConfirmDialog>
      )}

      {folderIntroOpen && (
        <FolderIntroDialog
          onCancel={() => setFolderIntroOpen(false)}
          onChoose={() => { folderIntroSeenRef.current = true; setFolderIntroOpen(false); pickFolderAndRun(); }}
        />
      )}

      {/* ---------------- status bar ---------------- */}
      <footer className="shrink-0 h-7 bg-white border-t border-line flex items-center gap-4 px-4 text-xs text-ink-muted">
        <button onClick={() => setActiveTab('validate-export')} className="inline-flex items-center gap-1.5 hover:text-ink" title="Open the validation report">
          {isBlank ? (
            <><span className="dot bg-line-strong" /><span>Empty form</span></>
          ) : liveReport.errors.length > 0 ? (
            <><span className="dot bg-bad" /><span className="text-ink">{liveReport.errors.length} error{liveReport.errors.length === 1 ? '' : 's'}</span></>
          ) : (
            <><span className="dot bg-ok" /><span className="text-ink">Valid DRMD 1.0.0</span></>
          )}
          {!isBlank && liveReport.conditionalErrors.length > 0 && <span>· {liveReport.conditionalErrors.length} to check</span>}
          {!isBlank && liveReport.warnings.length > 0 && <span>· {liveReport.warnings.length} note{liveReport.warnings.length === 1 ? '' : 's'}</span>}
        </button>
        {bulkResults.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            {bulkProcessing ? <Spinner size={10} className="text-petrol-600" /> : <Icon name="folder" size={13} />}
            {bulkFolderName ? `${bulkFolderName}: ` : 'Folder: '}{doneTotal - incompleteTotal} of {bulkResults.length} done{incompleteTotal ? `, ${incompleteTotal} incomplete` : ''}{failedTotal ? `, ${failedTotal} failed` : ''}
          </span>
        )}
        {pendingChecks.total > 0 && (
          <button onClick={() => firstTabToCheck && setActiveTab(firstTabToCheck)} className="inline-flex items-center gap-1.5 hover:text-ink" title="Values the model derived that do not appear word for word in the PDF. Verify each one against the certificate.">
            <span className="dot bg-check" /><span className="text-ink">{pendingChecks.total} value{pendingChecks.total === 1 ? '' : 's'} to verify</span>
          </button>
        )}
        {pdfIndex && !pdfIndex.hasText && pdfUrl && <span title="The PDF has no text layer (scanned), so values cannot be compared with it automatically.">Scanned PDF: values not compared</span>}
        {identifierStatus && <span className="inline-flex items-center gap-1.5 truncate"><Spinner size={10} className="text-petrol-600" /> Looking up identifiers</span>}
        {(unitStatus || Object.values(unitBusy).some(Boolean)) && <span className="inline-flex items-center gap-1.5 truncate" title="The AI writes the units the rules could not convert; the rules check every answer"><Spinner size={10} className="text-petrol-600" /> Checking units (D-SI)</span>}
        <div className="flex-1" />
        <button onClick={() => setActiveTab('settings')} className="inline-flex items-center gap-1.5 hover:text-ink">
          <Icon name="key" size={13} /> {conn.apiKey ? `${providerLabel}${conn.model !== AUTO ? ` · ${conn.model}` : ''}` : `No API key for ${providerLabel}`}
        </button>
      </footer>
    </div>
  );
};

/**
 * A fixed name in the generator (a field label, a column header, a section title) is a DRMD
 * schema name, not extracted content. Clicking it opens the matching section of the DRMD
 * guidance document in a new tab so the user can look up what the name means. Names with
 * no documented counterpart render as plain text — never as a dead link.
 */
/** Explains a folder run before the browser asks for permission to save into the folder. */
const FolderIntroDialog: React.FC<{ onCancel: () => void; onChoose: () => void }> = ({ onCancel, onChoose }) => {
    const chooseRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        chooseRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);
    return (
        <div className="fixed inset-0 z-[80] bg-ink/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="folder-intro-title" className="w-full max-w-[520px] rounded-md bg-white shadow-float">
                <div className="px-6 pt-5 pb-4">
                    <h2 id="folder-intro-title" className="text-lg font-semibold text-ink">Convert a folder of certificates</h2>
                    <ul className="mt-3 space-y-2.5 text-sm text-ink-soft">
                        <li className="flex gap-2.5"><Icon name="folder" className="text-petrol-600 mt-0.5 shrink-0" />
                            <span>Choose the folder that holds the certificate PDFs. PDFs in its subfolders are included.</span></li>
                        <li className="flex gap-2.5"><Icon name="file" className="text-petrol-600 mt-0.5 shrink-0" />
                            <span>The extracted <span className="font-medium text-ink">DRMD XML</span> and <span className="font-medium text-ink">HTML</span> files are automatically exported to the same folder. Your PDFs remain unchanged.</span></li>
                        <li className="flex gap-2.5"><Icon name="refresh" className="text-petrol-600 mt-0.5 shrink-0" />
                            <span>Each PDF extraction is automatically saved as it is ready. Should the extraction process halt unexpectedly, simply restart by uploading the same folder again. This is safe, as documents that have already been extracted are skipped.</span></li>
                    </ul>
                    <div className="mt-4 rounded border border-petrol-100 bg-petrol-50 px-3.5 py-2.5 text-sm text-petrol-900 space-y-1.5" data-testid="folder-dialog-note">
                        <p>
                            In the folder dialog, Windows lists only folders, not the PDFs inside them, and may say that no items match your search.
                            That is expected: select the folder and click <span className="font-semibold">Select Folder</span>.
                        </p>
                        <p>
                            Then your browser asks <span className="font-medium">“Allow this site to edit files?”</span> Choose <span className="font-semibold">Allow</span> so the converted files can be saved into the folder.
                        </p>
                    </div>
                    <p className="mt-3 hint">You can also drag the folder from the file explorer onto the left pane.</p>
                </div>
                <div className="flex justify-end gap-2 px-6 py-3.5 border-t border-line-soft bg-sunken rounded-b-md">
                    <button onClick={onCancel} className="btn-secondary">Cancel</button>
                    <button ref={chooseRef} onClick={onChoose} className="btn-primary"><Icon name="folder" /> Choose folder</button>
                </div>
            </div>
        </div>
    );
};

/** A folder dropped onto the certificate pane: save the results into it, or keep them in the tab. */
const DroppedFolderDialog: React.FC<{
    name: string; count: number; withXml: number;
    onCancel: () => void; onSave: () => Promise<string | null>; onKeep: () => void;
}> = ({ name, count, withXml, onCancel, onSave, onKeep }) => {
    const saveRef = useRef<HTMLButtonElement>(null);
    const [note, setNote] = useState<string | null>(null);
    useEffect(() => {
        saveRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);
    return (
        <div className="fixed inset-0 z-[80] bg-ink/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="dropped-folder-title" className="w-full max-w-[520px] rounded-md bg-white shadow-float">
                <div className="px-6 pt-5 pb-4">
                    <h2 id="dropped-folder-title" className="text-lg font-semibold text-ink">Convert the folder “{name}”</h2>
                    <p className="mt-3 text-sm text-ink-soft">
                        {count} certificate PDF{count === 1 ? '' : 's'} found{count > 0 ? ', subfolders included' : ''}.
                        {withXml > 0 && ` ${withXml} of them already ${withXml === 1 ? 'has its' : 'have their'} XML beside ${withXml === 1 ? 'it' : 'them'}; when saving into the folder, ${withXml === 1 ? 'it is' : 'they are'} skipped.`}
                    </p>
                    <ul className="mt-3 space-y-2.5 text-sm text-ink-soft">
                        <li className="flex gap-2.5"><Icon name="folder" className="text-petrol-600 mt-0.5 shrink-0" />
                            <span><span className="font-medium text-ink">Save into the folder:</span> the extracted DRMD XML and HTML files are automatically exported to the same folder. Your PDFs remain unchanged. The browser asks <span className="font-medium">“Allow this site to edit files?”</span>; choose <span className="font-semibold">Allow</span>.</span></li>
                        <li className="flex gap-2.5"><Icon name="file" className="text-petrol-600 mt-0.5 shrink-0" />
                            <span><span className="font-medium text-ink">Keep results in this tab:</span> nothing is written to the folder; the results can be downloaded as a ZIP.</span></li>
                    </ul>
                    {note && <p className="mt-3 rounded border border-check-line bg-check-bg px-3 py-2 text-sm text-ink" role="alert">{note}</p>}
                </div>
                <div className="flex flex-wrap justify-end gap-2 px-6 py-3.5 border-t border-line-soft bg-sunken rounded-b-md">
                    <button onClick={onCancel} className="btn-secondary">Cancel</button>
                    <button onClick={onKeep} className="btn-secondary">Keep results in this tab</button>
                    <button ref={saveRef} onClick={async () => { const msg = await onSave(); if (msg) setNote(msg); }} className="btn-primary"><Icon name="folder" /> Save into the folder</button>
                </div>
            </div>
        </div>
    );
};

/** A short question before something that cannot be undone (e.g. clearing the form). */
const ConfirmDialog: React.FC<{ title: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void; children: React.ReactNode }> = ({ title, confirmLabel, onCancel, onConfirm, children }) => {
    const confirmRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        confirmRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);
    return (
        <div className="fixed inset-0 z-[80] bg-ink/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" className="w-full max-w-[460px] rounded-md bg-white shadow-float">
                <div className="px-6 pt-5 pb-4">
                    <h2 id="confirm-title" className="text-lg font-semibold text-ink">{title}</h2>
                    <p id="confirm-text" className="mt-2 text-sm text-ink-soft">{children}</p>
                </div>
                <div className="flex justify-end gap-2 px-6 py-3.5 border-t border-line-soft bg-sunken rounded-b-md">
                    <button onClick={onCancel} className="btn-secondary">Cancel</button>
                    <button ref={confirmRef} onClick={onConfirm} className="btn-primary">{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};

const DocsLabel: React.FC<{ label: string; docs?: string; className?: string; children?: React.ReactNode; quiet?: boolean }> = ({ label, docs, className, children, quiet }) => {
    const href = docsUrlFor(label, docs);
    const content = children ?? label;
    if (!href) return <span className={className}>{content}</span>;
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={`What is "${label.replace(/\s*\*$/, '')}"? Opens the DRMD guidance document`}
            className={`${className || ''} ${quiet ? 'no-underline hover:underline' : 'underline'} decoration-dotted decoration-line-strong underline-offset-[3px] hover:text-petrol-700 hover:decoration-petrol-600`}
        >
            {content}
        </a>
    );
};

/** Section title row. `action` sits at the right end (e.g. "Add producer"). */
const SectionHeader: React.FC<{ title: string; docs?: string; action?: React.ReactNode; level?: 'page' | 'section' }> = ({ title, docs, action, level = 'section' }) => (
    <div className={level === 'page' ? 'flex items-end justify-between gap-4 mb-6' : 'section-head'}>
        <h2 className={level === 'page' ? 'page-title' : 'section-title'}><DocsLabel label={title} docs={docs} quiet /></h2>
        {action}
    </div>
);

/** Renders "Name *" as "Name" plus a required marker that screen readers announce. */
const LabelText: React.FC<{ label: string; docs?: string }> = ({ label, docs }) => {
    const required = /\*\s*$/.test(label);
    const text = label.replace(/\s*\*\s*$/, '');
    return (
        <>
            <DocsLabel label={label} docs={docs}>{text}</DocsLabel>
            {required && <span className="text-bad ml-0.5" aria-label="required">*</span>}
        </>
    );
};

/**
 * A checkbox whose whole label ticks it. The link to the guidance document is a separate small icon
 * next to it, so that clicking the word never opens the guide instead of ticking the box.
 */
const CheckWithDocs: React.FC<{ label: string; docsLabel?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; note?: string; title?: string }> = ({ label, docsLabel, checked, disabled, onChange, note, title }) => {
    const href = docsUrlFor(docsLabel || label);
    return (
        <span className="inline-flex items-center gap-1" title={title}>
            <label className={`check-label ${disabled ? '!cursor-not-allowed text-ink-muted' : ''}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className={disabled ? '!cursor-not-allowed' : ''} />
                {label}
            </label>
            {note && <span className="text-2xs text-ink-muted whitespace-nowrap">{note}</span>}
            {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-5 h-5 rounded text-ink-faint hover:text-petrol-700 hover:bg-petrol-50"
                   title={`What is "${label}"? Opens the DRMD guidance document`} aria-label={`What is ${label}? Opens the DRMD guidance document`}>
                    <Icon name="help" size={13} />
                </a>
            )}
        </span>
    );
};

/** Result of "Check key" for one provider. */
interface ProviderCheck { busy: boolean; ok?: boolean; msg?: string; models?: ModelOption[] }

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** One AI provider in AI settings: key, check, model choice and what the provider states about data and speed. */
const ProviderCard: React.FC<{
    id: ProviderId; active: boolean; apiKey: string; model: string; check?: ProviderCheck;
    onActivate: () => void; onKey: (v: string) => void; onModel: (v: string) => void; onCheck: () => void;
    region?: string; onRegion: (v: string) => void; locked: boolean;
}> = ({ id, active, apiKey, model, check, onActivate, onKey, onModel, onCheck, region, onRegion, locked }) => {
    const p = PROVIDERS[id];
    const keyLabel = id === 'gemini' ? 'Gemini API key' : `${p.label} API key`;
    const options: ModelOption[] = check?.models && check.models.length > 0 ? check.models : p.autoChain.map(m => ({ id: m, label: m }));
    const chosen = options.find(o => o.id === model);
    const statusTone = check?.busy ? 'text-ink-muted' : check?.ok ? 'text-ok' : check?.ok === false ? 'text-bad' : 'text-ink-muted';
    return (
        <div className={`rounded-md border px-4 py-3 transition-colors ${active ? 'border-petrol-600 bg-petrol-50/40' : 'border-line bg-white'}`}>
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                    <input type="radio" name="ai-provider" checked={active} onChange={onActivate} disabled={locked} aria-label={`Use ${p.label}`} />
                    <span className="text-sm font-semibold text-ink whitespace-nowrap">{p.label}</span>
                    {p.company !== p.label && <span className="text-xs text-ink-muted truncate">{p.company}</span>}
                </label>
                {active && <span className="tag-ok shrink-0">In use</span>}
            </div>
            <div className="mt-2 flex gap-2">
                {/* The key is set as the field's value property, not passed as the React value prop:
                    React would mirror that prop into the HTML value attribute, and from there the key
                    would end up in "Save page as" copies and in tools that read the page markup. */}
                <input
                    type="password"
                    ref={(el) => { if (el && el.value !== apiKey) el.value = apiKey; }}
                    onChange={(e) => onKey(e.target.value)}
                    disabled={locked}
                    placeholder={`Paste your key, e.g. ${p.keyPlaceholder}`}
                    autoComplete="off"
                    spellCheck={false}
                    data-1p-ignore=""
                    data-lpignore="true"
                    data-bwignore=""
                    data-form-type="other"
                    aria-label={keyLabel}
                    className="field-control text-sm tabular-nums flex-1 min-w-0"
                />
                <button onClick={onCheck} disabled={!apiKey || check?.busy || locked} className="btn-secondary shrink-0" title={`Ask ${p.company} whether the key works and which of its models can read the certificates`}>
                    {check?.busy ? <Spinner size={12} /> : <Icon name="check" size={14} />} Check key
                </button>
                {apiKey && <button onClick={() => onKey('')} disabled={locked} className="btn-quiet shrink-0" title="Remove the key from this tab">Clear</button>}
            </div>
            <p className={`hint mt-1.5 ${statusTone}`} role="status">
                {check?.busy ? `Asking ${p.company}…`
                    : check?.msg ? check.msg
                    : apiKey ? 'Key entered. "Check key" confirms that it works and lists its models.'
                    : <>No key yet. Create one at <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="text-petrol-600 hover:underline">{hostOf(p.keyUrl)}</a>.</>}
            </p>
            {active && (
                <div className="mt-3 pt-3 border-t border-line-soft space-y-2">
                    {p.regions && (
                        <div className="max-w-[560px]">
                            <label className="field-label mb-1" htmlFor={`region-${id}`}>Region</label>
                            <select id={`region-${id}`} value={region} onChange={(e) => onRegion(e.target.value)} disabled={locked} className="field-control text-sm">
                                {p.regions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                            <p className="hint mt-1">The key must come from the same region: each region has its own keys, models and prices.</p>
                        </div>
                    )}
                    <div className="max-w-[560px]">
                        <label className="field-label mb-1" htmlFor={`model-${id}`}>Model</label>
                        <select id={`model-${id}`} value={model} onChange={(e) => onModel(e.target.value)} disabled={locked} className="field-control text-sm">
                            <option value={AUTO}>Automatic (recommended)</option>
                            {model !== AUTO && !chosen && <option value={model}>{model}</option>}
                            {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <p className="hint mt-1">
                            {model === AUTO ? p.autoNote
                                : chosen?.ocr ? 'Only this model is used. It reads images, not PDFs: OpenRouter first converts the PDF to text, which is billed extra.'
                                : 'Only this model is used. If it is busy or rate limited, the request waits and retries.'}
                            {!check?.models && ' Check the key to choose from all models it can use.'}
                        </p>
                    </div>
                    {p.inputNote && <p className="hint"><span className="font-medium text-ink-soft">PDF:</span> {p.inputNote}</p>}
                    <p className="hint"><span className="font-medium text-ink-soft">Data:</span> {p.dataNote}</p>
                    <p className="hint"><span className="font-medium text-ink-soft">Speed:</span> {p.latencyNote}</p>
                    <p className="hint flex flex-wrap gap-x-3">
                        <a href={p.pricingUrl} target="_blank" rel="noopener noreferrer" className="text-petrol-600 hover:underline">Prices</a>
                        {p.availabilityUrl && <a href={p.availabilityUrl} target="_blank" rel="noopener noreferrer" className="text-petrol-600 hover:underline">{p.availabilityLabel || 'Countries where it is available'}</a>}
                        <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="text-petrol-600 hover:underline">API keys</a>
                    </p>
                </div>
            )}
        </div>
    );
};

const fmtTokens = (n: number) => Math.round(n).toLocaleString('en-US');
// Requests usually cost fractions of a cent, so small amounts keep four decimals.
const fmtUsd = (n: number) => (n > 0 && n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** Tokens and cost of the AI requests of this tab, as the providers reported them. */
const UsagePanel: React.FC<{ activeProvider: ProviderId }> = ({ activeProvider }) => {
    const [snap, setSnap] = useState(usageSnapshot);
    useEffect(() => subscribeUsage(() => setSnap(usageSnapshot())), []);
    // Requests per minute: counted over the last 60 seconds, so refreshed every few seconds as well
    const [rpm, setRpm] = useState<RpmRow[]>(rpmSnapshot);
    useEffect(() => {
        const refresh = () => setRpm(rpmSnapshot());
        const unsubscribe = subscribeRpm(refresh);
        const timer = setInterval(refresh, 5000);
        return () => { unsubscribe(); clearInterval(timer); };
    }, []);
    const rpmOf = (provider: string, model: string) => rpm.filter(r => r.provider === provider && r.model === model)
        .reduce<{ n: number; limit?: RpmRow['limit'] }>((a, r) => ({ n: a.n + r.lastMinute, limit: r.limit && (!a.limit || r.limit.rpm < a.limit.rpm) ? r.limit : a.limit }), { n: 0 });
    const RPM_SOURCE: Record<string, string> = {
        quota: 'stated by the provider in its answer to a refused request',
        headers: 'stated by the provider in the headers of its answers',
        observed: 'counted: the requests the model accepted in the minute before it refused one',
    };
    const { totals, recent } = snap;
    const sum = totals.reduce((a, t) => ({
        requests: a.requests + t.requests, input: a.input + t.inputTokens, output: a.output + t.outputTokens,
        usd: a.usd + t.usd, unpriced: a.unpriced + t.unpriced,
    }), { requests: 0, input: 0, output: 0, usd: 0, unpriced: 0 });
    // A model that is not in the generator's price list (pricing.ts) gets no cost rather than a guess.
    const costText = (usd: number, unpriced: number, requests: number) =>
        unpriced === requests ? 'price not listed' : `${fmtUsd(usd)}${unpriced ? ` + ${unpriced} request${unpriced === 1 ? '' : 's'} without a listed price` : ''}`;
    return (
        <div className="section">
            <SectionHeader title="Usage in this tab" action={totals.length > 0 ? <button onClick={clearUsage} className="btn-quiet btn-sm">Reset</button> : undefined} />
            {totals.length === 0 ? (
                <p className="hint">No AI requests yet. After an extraction, the tokens and the cost of every request appear here.</p>
            ) : (
                <>
                    <div className="panel overflow-x-auto">
                        <table className="data-table min-w-[560px]">
                            <thead>
                                <tr>
                                    <th>Model</th>
                                    <th className="text-right">Requests</th>
                                    <th className="text-right" title="Requests sent to the model in the last 60 seconds, and its limit per minute once known">Last minute</th>
                                    <th className="text-right">Input tokens</th>
                                    <th className="text-right">Output tokens</th>
                                    <th className="text-right">Cost (USD)</th>
                                    <th className="text-right" title="Average time per request, measured in this tab">Avg. time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {totals.map(t => (
                                    <tr key={`${t.provider}|${t.region || ''}|${t.model}`}>
                                        <td className="py-2 text-sm">
                                            <span className="block font-medium text-ink whitespace-nowrap">{t.model}</span>
                                            <span className="block text-2xs text-ink-muted">{PROVIDERS[t.provider].label}{t.region ? ` · ${PROVIDERS[t.provider].regions?.find(r => r.id === t.region)?.label || t.region}` : ''}</span>
                                        </td>
                                        <td className="py-2 text-right tabular-nums">{t.requests}</td>
                                        {(() => { const r = rpmOf(t.provider, t.model); return (
                                            <td className="py-2 text-right tabular-nums whitespace-nowrap" title={r.limit ? `Limit ${r.limit.rpm} requests per minute, ${RPM_SOURCE[r.limit.source]}` : 'No limit known yet'}>
                                                {r.n}{r.limit && <span className="block text-2xs text-ink-muted">limit {r.limit.rpm}/min</span>}
                                            </td>
                                        ); })()}
                                        <td className="py-2 text-right tabular-nums">{fmtTokens(t.inputTokens)}{t.cachedTokens > 0 && <span className="block text-2xs text-ink-muted whitespace-nowrap">{fmtTokens(t.cachedTokens)} cached</span>}</td>
                                        <td className="py-2 text-right tabular-nums">{fmtTokens(t.outputTokens)}{t.reasoningTokens > 0 && <span className="block text-2xs text-ink-muted whitespace-nowrap" title="Reasoning (thinking) tokens are billed as output">{fmtTokens(t.reasoningTokens)} reasoning</span>}</td>
                                        <td className="py-2 text-right tabular-nums">{costText(t.usd, t.unpriced, t.requests)}{t.providerPriced > 0 && <span className="block text-2xs text-ink-muted whitespace-nowrap">stated by provider</span>}</td>
                                        <td className="py-2 text-right tabular-nums whitespace-nowrap">{(t.durationMs / t.requests / 1000).toFixed(1)} s</td>
                                    </tr>
                                ))}
                            </tbody>
                            {totals.length > 1 && (
                                <tfoot>
                                    <tr className="font-semibold">
                                        <td className="py-2 text-sm">Total</td>
                                        <td className="py-2 text-right tabular-nums">{sum.requests}</td>
                                        <td />
                                        <td className="py-2 text-right tabular-nums">{fmtTokens(sum.input)}</td>
                                        <td className="py-2 text-right tabular-nums">{fmtTokens(sum.output)}</td>
                                        <td className="py-2 text-right tabular-nums">{costText(sum.usd, sum.unpriced, sum.requests)}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    <details className="mt-3 panel">
                        <summary className="px-4 h-10 flex items-center text-sm font-medium cursor-pointer select-none">Last {recent.length} request{recent.length === 1 ? '' : 's'}</summary>
                        <ul className="divide-y divide-line-soft border-t border-line-soft">
                            {recent.map((e, i) => (
                                <li key={i} className="px-4 py-2 text-xs text-ink-soft flex flex-wrap gap-x-3 gap-y-0.5">
                                    <span className="tabular-nums text-ink-muted">{new Date(e.at).toLocaleTimeString()}</span>
                                    <span className="font-medium text-ink">{e.purpose}</span>
                                    {e.doc && <span className="truncate max-w-[220px]" title={e.doc}>{e.doc}</span>}
                                    <span className="tabular-nums">{e.model}</span>
                                    <span className="tabular-nums">{fmtTokens(e.usage.inputTokens)} in · {fmtTokens(e.usage.outputTokens)} out</span>
                                    <span className="tabular-nums">{e.cost.usd === null ? 'price not listed' : fmtUsd(e.cost.usd)}</span>
                                    <span className="tabular-nums">{(e.durationMs / 1000).toFixed(1)} s</span>
                                </li>
                            ))}
                        </ul>
                    </details>
                </>
            )}
            <p className="hint mt-3">
                Token counts are the numbers each provider reported in its answers. OpenRouter states the cost of each request itself;
                for the other providers the cost is those tokens multiplied by the provider's published list price (checked {PRICES_CHECKED}).
                For a model that is not in the generator's price list, see the provider's price page (link in its box above).
                Not included: use within a free tier (not billed), discounts and taxes. A request the generator stopped waiting for can still be billed by the provider and is not counted here.
                The numbers exist only in this tab.
            </p>
            {rpm.some(r => r.limit) && (
                <div className="mt-3 text-xs text-ink-soft" data-testid="rpm-limits">
                    <span className="font-medium text-ink">Known limits per minute: </span>
                    {rpm.filter(r => r.limit).map((r, i) => (
                        <span key={`${r.provider}|${r.model}|${i}`} className="mr-3 whitespace-nowrap" title={RPM_SOURCE[r.limit!.source]}>
                            {r.model}: {r.lastMinute} of {r.limit!.rpm} used
                        </span>
                    ))}
                </div>
            )}
            <p className="hint mt-1">
                Requests per minute: each provider limits how many requests a key may send to a model per minute. Once a model's limit is known
                (from the provider's answer or headers, or counted when it refused a request), the generator waits for a free slot instead of
                sending requests that would be refused and come back empty.
            </p>
            <p className="hint mt-1">
                Times are measured in this tab, from sending a request to receiving the complete answer; they depend on the size of the PDF and on how busy the provider is.
                {' '}{PROVIDERS[activeProvider].latencyNote}
            </p>
        </div>
    );
};

/** A date field cannot show text that is not a date, so such a value would look empty: say so. */
const UnreadableDate: React.FC<{ value?: string }> = ({ value }) => {
    const v = (value || '').trim();
    if (!v || toXsdDate(v)) return null;
    return (
        <p className="hint !text-check mt-1 sm:col-span-2" role="alert">
            The date "{v.length > 80 ? v.slice(0, 80) + '…' : v}" could not be read, so the field looks empty. Pick the date from the certificate.
        </p>
    );
};

const VERIFY_HINT = "This value could not be found word for word in the PDF text. Compare it with the certificate and tick the box if it is correct.";

/** The tick next to a field the model derived: "Mark as checked" → "Checked" (click again to undo). */
const VerifyToggle: React.FC<{ status: VerifyStatus; onToggle: () => void; compact?: boolean }> = ({ status, onToggle, compact }) => {
    if (!status) return null;
    if (status === 'check') {
        return (
            <button type="button" onClick={onToggle} title={VERIFY_HINT}
                className={compact
                    ? 'inline-flex items-center justify-center w-5 h-5 rounded-sm text-check hover:bg-check-bg'
                    : 'inline-flex items-center gap-1 h-6 px-1.5 -my-1 rounded-sm text-2xs font-medium text-check border border-check-line bg-check-bg hover:border-check'}
                aria-label="Mark as verified">
                <Icon name="square" size={compact ? 14 : 13} />{!compact && 'Mark as verified'}
            </button>
        );
    }
    return (
        <button type="button" onClick={onToggle} title="You verified this value against the PDF. Click to undo."
            className={compact
                ? 'inline-flex items-center justify-center w-5 h-5 rounded-sm text-ok hover:bg-ok-bg'
                : 'inline-flex items-center gap-1 h-6 px-1.5 -my-1 rounded-sm text-2xs font-medium text-ok hover:bg-ok-bg'}
            aria-label="Verified. Click to undo">
            <Icon name="checkSquare" size={compact ? 14 : 13} />{!compact && 'Verified'}
        </button>
    );
};

const FieldShell: React.FC<{ label: string; docs?: string; onInfoClick?: () => void; verify?: VerifyStatus; onVerifyToggle?: () => void; children: React.ReactNode }> = ({ label, docs, onInfoClick: infoClick, verify, onVerifyToggle, children }) => {
    // "Show in the PDF" only when a PDF is shown: without one it could not mark anything.
    const { hasPdf } = React.useContext(PdfLinkContext);
    const onInfoClick = hasPdf ? infoClick : undefined;
    return (
    <div className="w-full field-row">
        {(label || onInfoClick) && (
            <div className="field-label-row flex items-center justify-between gap-2 mb-1 min-h-[18px]">
                {label ? <label className="field-label"><LabelText label={label} docs={docs} /></label> : <span />}
                <span className="inline-flex items-center gap-1">
                    {verify && onVerifyToggle && <VerifyToggle status={verify} onToggle={onVerifyToggle} />}
                    {onInfoClick && (
                        <button
                            type="button"
                            onClick={onInfoClick}
                            title="Show in the PDF"
                            aria-label={`Show ${label.replace(/\s*\*$/, '') || 'value'} in the PDF`}
                            className="-my-1 inline-flex items-center justify-center w-6 h-6 rounded text-ink-faint hover:text-petrol-600 hover:bg-petrol-50 transition-colors"
                        >
                            <Icon name="locate" size={14} />
                        </button>
                    )}
                </span>
            </div>
        )}
        {children}
    </div>
    );
};

/** Verification state for a PDF-linked field, and an onChange that counts an edit as checked. */
const useVerify = (enabled: boolean, value: unknown, source: unknown, onChange: (v: string) => void) => {
    const api = React.useContext(VerifyContext);
    const status = enabled ? api.status(value, source) : null;
    const toggle = () => api.setChecked(value, status === 'check');
    // A value the user typed is their own: it no longer needs a check.
    const change = (v: string) => { if (status) api.setChecked(v, true); onChange(v); };
    return { status, toggle, change };
};

const CHECK_FIELD = 'border-check bg-check-bg/50 hover:border-check';

const Input: React.FC<{ label: string; value: any; onChange: (v: string) => void; type?: string; disabled?: boolean; onInfoClick?: () => void; onFocus?: () => void; docs?: string; placeholder?: string; mono?: boolean; source?: string; noVerify?: boolean }> = ({ label, value, onChange, type = "text", disabled, onInfoClick, onFocus, docs, placeholder, mono, source, noVerify }) => {
    const v = useVerify(!!onInfoClick && !noVerify && type === 'text', value, source, onChange);
    const { autoLocate } = React.useContext(PdfLinkContext);
    return (
        <FieldShell label={label} docs={docs} onInfoClick={onInfoClick} verify={v.status} onVerifyToggle={v.toggle}>
            <input
                type={type}
                value={value ?? ''}
                onChange={(e) => v.change(e.target.value)}
                disabled={disabled}
                onFocus={autoLocate ? onFocus : undefined}
                placeholder={placeholder}
                title={v.status === 'check' ? VERIFY_HINT : undefined}
                className={`field-control ${mono ? 'text-sm tabular-nums' : ''} ${v.status === 'check' ? CHECK_FIELD : ''}`}
            />
        </FieldShell>
    );
};

const Select: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void; onFocus?: () => void; onInfoClick?: () => void; docs?: string }> = ({ label, value, options, onChange, onFocus, onInfoClick, docs }) => {
    const { autoLocate } = React.useContext(PdfLinkContext);
    return (
    <FieldShell label={label} docs={docs} onInfoClick={onInfoClick}>
        <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onFocus={autoLocate ? onFocus : undefined}
            className="field-control"
        >
            {options.map(o => <option key={o} value={o}>{o.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}</option>)}
        </select>
    </FieldShell>
    );
};

const TextArea: React.FC<{ label: string; value: string; onChange: (v: string) => void; onInfoClick?: () => void; onFocus?: () => void; docs?: string; rows?: number; source?: string; noVerify?: boolean }> = ({ label, value, onChange, onInfoClick, onFocus, docs, rows = 3, source, noVerify }) => {
    const v = useVerify(!!onInfoClick && !noVerify, value, source, onChange);
    const { autoLocate } = React.useContext(PdfLinkContext);
    return (
        <FieldShell label={label} docs={docs} onInfoClick={onInfoClick} verify={v.status} onVerifyToggle={v.toggle}>
            <textarea
                value={value || ''}
                onChange={(e) => v.change(e.target.value)}
                onFocus={autoLocate ? onFocus : undefined}
                rows={rows}
                title={v.status === 'check' ? VERIFY_HINT : undefined}
                className={`field-control ${v.status === 'check' ? CHECK_FIELD : ''}`}
            />
        </FieldShell>
    );
};

/** An editable table cell; flagged like the fields when the value is not in the PDF. */
const DSI_BADGE: Record<DsiClass, string> = {
    platinum: 'bg-petrol-50 text-petrol-800 border-petrol-200',
    gold: 'bg-note-bg text-note border-note-line',
    silver: 'bg-sunken text-ink-muted border-line-strong',
    bronze: 'bg-check-bg text-check border-check-line',
    improvable: 'bg-bad-bg text-bad border-bad-line',
};

/** The D-SI unit of a row: editable, checked against the D-SI rules, with its quality class. */
const DsiCell: React.FC<{ unit: string; dsi: string; busy?: boolean; onFocus: () => void; onChange: (v: string) => void }> = ({ unit, dsi, busy, onFocus, onChange }) => {
    const [editing, setEditing] = useState(false);
    const value = String(dsi ?? '');
    const hasUnit = String(unit ?? '').trim() !== '';
    const check = value.trim() ? checkDsi(value) : null;
    const invalid = !!check && !check.ok;
    const cls: DsiClass | null = check ? (check.ok ? check.cls : null) : (hasUnit ? 'improvable' : null);
    const title = invalid
        ? `Not a valid D-SI unit: ${issuesText(check!.errors)}`
        : cls ? `D-SI class ${DSI_CLASS_LABEL[cls]}: ${DSI_CLASS_MEANING[cls]}` : 'D-SI unit written to the XML';
    const box = `cell-input font-mono !text-xs min-w-0 !h-auto min-h-[28px] py-[5px] leading-4 ${invalid ? '!border-bad bg-bad-bg/60' : ''}`;
    // Quality class (or the AI at work), shown after the unit
    const badgeBase = 'inline-block align-[1px] whitespace-nowrap rounded-sm border px-1 font-sans text-2xs font-medium';
    const badge = busy
        ? <span className="inline-flex align-middle" title="The AI is writing this unit in D-SI"><Spinner size={11} className="text-petrol-600" /></span>
        : invalid
        ? <span className={`${badgeBase} ${DSI_BADGE.improvable}`} title={title}>Invalid</span>
        : cls ? <span className={`${badgeBase} ${DSI_BADGE[cls]}`} title={title} data-dsi-class={cls}>{DSI_CLASS_LABEL[cls]}</span> : null;
    return (
        <div className="flex flex-col items-start gap-1 min-w-0" data-dsi-cell="" data-dsi-value={value} data-dsi-invalid={invalid ? 'true' : undefined}>
            {editing ? (
                // One line of text; a textarea only so that a long unit wraps while it is edited.
                <textarea
                    className={`${box} resize-none overflow-hidden break-all [field-sizing:content]`}
                    rows={1}
                    autoFocus
                    aria-label="D-SI unit"
                    aria-invalid={invalid || undefined}
                    title={title}
                    value={value}
                    placeholder={hasUnit ? 'no D-SI form' : ''}
                    spellCheck={false}
                    autoComplete="off"
                    onBlur={() => setEditing(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                    onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ''))}
                />
            ) : (
                // Shown with a possible line break before each identifier; click to edit.
                <button
                    type="button"
                    className={`${box} text-left cursor-text`}
                    aria-label={`D-SI unit${value ? ` ${value}` : ''}${cls ? `, class ${DSI_CLASS_LABEL[cls]}` : ''}. Edit`}
                    title={`${title}. Click to see where it comes from and to edit it.`}
                    onFocus={onFocus}
                    onClick={() => setEditing(true)}
                >
                    {value
                        ? value.split(/(?=\\)/).map((part, i) => <React.Fragment key={i}>{i > 0 && <wbr />}{part}</React.Fragment>)
                        : <span className="font-sans text-ink-faint">{hasUnit ? 'no D-SI form' : '–'}</span>}
                    {' '}{badge}
                </button>
            )}
            {editing && badge}
        </div>
    );
};

/**
 * An editable table cell; flagged like the fields when the value is not in the PDF. `problem`: what is
 * wrong with the value as typed (the same rules the XML is written with), shown right under the cell.
 */
const CellInput: React.FC<{ value: any; onChange: (v: string) => void; onFocus?: () => void; ariaLabel: string; align?: 'left' | 'right'; problem?: string; placeholder?: string; title?: string }> = ({ value, onChange, onFocus, ariaLabel, align = 'left', problem, placeholder, title }) => {
    const v = useVerify(true, value, undefined, onChange);
    const { autoLocate } = React.useContext(PdfLinkContext);
    const msgId = React.useId();
    return (
        <div className="relative">
            <input
                className={`cell-input ${align === 'right' ? 'text-right' : ''} ${v.status ? 'pr-6' : ''} ${problem ? '!border-bad bg-bad-bg/60' : v.status === 'check' ? '!border-check bg-check-bg/60' : ''}`}
                aria-label={ariaLabel}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? msgId : undefined}
                title={problem || (v.status === 'check' ? VERIFY_HINT : title)}
                placeholder={placeholder}
                value={value ?? ''}
                onFocus={autoLocate ? onFocus : undefined}
                onChange={(e) => v.change(e.target.value)}
            />
            {v.status && <span className={`absolute right-0.5 ${problem ? 'top-3.5' : 'top-1/2'} -translate-y-1/2`}><VerifyToggle compact status={v.status} onToggle={v.toggle} /></span>}
            {problem && <p id={msgId} className={`mt-0.5 px-1.5 text-2xs leading-[13px] text-bad ${align === 'right' ? 'text-right' : ''}`} data-cell-problem="">{problem}</p>}
        </div>
    );
};

/**
 * What is wrong with a row's uncertainty, k and P as typed. The rules are those the XML is written with
 * (xmlGenerator): the uncertainty is one number; k is a number of 1 or more; P is a probability, typed
 * as 0.95 or as 95 %; an expanded uncertainty has both k and P, a standard uncertainty neither.
 */
const uncertaintyProblems = (q: Quantity): { uncertainty?: string; k?: string; p?: string } => {
    const t = (v: unknown) => String(v ?? '').trim();
    const u = t(q.uncertainty), k = t(q.coverageFactor), p = t(q.coverageProbability);
    const kOk = !k || toCoverageFactor(k) !== null;
    const pOk = !p || toCoverageProbability(p) !== null;
    return {
        uncertainty: u && toUncertaintyString(u) === null ? 'Enter one number, e.g. 0.05' : undefined,
        k: !kOk ? 'Enter a number of 1 or more, e.g. 2' : (u && !k && p ? 'Enter k too, or clear P' : undefined),
        p: !pOk ? 'Enter 0.95 or 95 %' : (u && !p && k ? 'Enter P too, or clear k' : undefined),
    };
};

/** "… coverage factor k …" with the quantity symbol k in italics. */
const italicK = (text: string): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    const re = /(^|[\s(])k(?=[\s.,;:)]|$)/g;
    let last = 0, n = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        const at = m.index + m[1].length;
        out.push(text.slice(last, at), <i key={n++}>k</i>);
        last = at + 1;
    }
    out.push(text.slice(last));
    return out;
};

/* ---- Identifier look-ups on request ---------------------------------------------------------- */

type LookupState = { busy: boolean; msg?: string; tone?: 'ok' | 'warn' };

/** Puts looked-up identifiers in place of those with the same scheme and keeps all others. Used when a look-up could not be completed. */
const mergeLookedUp = (existing: Identifier[], found: Identifier[]): Identifier[] => {
    const schemes = new Set(found.map(f => (f.scheme || '').toLowerCase()));
    return [...found, ...existing.filter(e => (e.value || '').trim() && !schemes.has((e.scheme || '').toLowerCase()))];
};

/** Magnifying-glass button that finds identifiers from the data in the form (again, if some are there already). */
const LookupButton: React.FC<{ busy?: boolean; onClick: () => void; label: string }> = ({ busy, onClick, label }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={label}
        aria-label={label}
        aria-busy={busy || undefined}
        className="icon-btn w-7 h-7 bg-petrol-600/10 text-petrol-700 hover:bg-petrol-600/20 hover:text-petrol-800 disabled:opacity-100"
    >
        {busy ? <Spinner size={13} /> : <Icon name="search" size={16} strokeWidth={2.2} />}
    </button>
);

/** The result of a look-up, shown next to its button. */
const LookupNote: React.FC<{ state?: LookupState; className?: string }> = ({ state, className }) => (
    <p role="status" className={`hint ${state?.msg ? 'mt-1' : 'sr-only'} ${state?.tone === 'warn' ? '!text-check' : state?.tone === 'ok' ? '!text-ok' : ''} ${state?.msg ? className || '' : ''}`}>
        {state?.msg || ''}
    </p>
);

/* ---- Chemical identifiers (CAS Registry Number, InChIKey) --------------------------------- */

const CHEM_SCHEMES = ['CAS', 'InChIKey'];
const casLink = (cas: string) => `https://commonchemistry.cas.org/detail?cas_rn=${cas}`;

/** True for a CAS or InChIKey entry, also while its value is still empty. */
const isChemId = (id: Identifier) => {
    const s = (id.scheme || '').trim().toLowerCase();
    return s === 'cas' || s === 'inchikey';
};

/** Says what is wrong with a CAS number or InChIKey, or returns null when it looks right. */
const chemIdProblem = (scheme: string, value: string): string | null => {
    const v = (value || '').trim();
    if (!v) return null;
    const s = (scheme || '').trim().toLowerCase();
    if (s === 'cas') {
        const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(v);
        if (!m) return 'A CAS number has the form 7440-50-8: two to seven digits, two digits and one check digit, separated by hyphens.';
        const sum = (m[1] + m[2]).split('').reverse().reduce((a, d, i) => a + Number(d) * (i + 1), 0);
        if (sum % 10 !== Number(m[3])) return 'The check digit of this CAS number does not match. Please compare it with the certificate.';
    } else if (s === 'inchikey') {
        if (!/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(v)) return 'An InChIKey has the form XLYOFNOQVPJJNP-UHFFFAOYSA-N: 14, 10 and 1 capital letters, separated by hyphens.';
    }
    return null;
};

/** Keeps the link in step with the value: a valid CAS number links to CAS Common Chemistry; any
 *  other identifier keeps its link only while scheme and value are unchanged. */
const withLink = (prev: Identifier, scheme: string, value: string): Identifier => {
    const v = value.trim();
    let link = '';
    if (scheme.toLowerCase() === 'cas') {
        if (v && !chemIdProblem('CAS', v)) link = casLink(v);
    } else if ((prev.scheme || '') === scheme && (prev.value || '').trim() === v) {
        link = prev.link || '';
    }
    return { ...prev, scheme, value, link };
};

/** Lets the user correct, add and remove CAS numbers and InChIKeys. Empty entries are not written to the XML. */
const ChemIdEditor: React.FC<{ ids: Identifier[]; onChange: (ids: Identifier[]) => void; label: string; emptyText: string; autoFocus?: boolean }> = ({ ids, onChange, label, emptyText, autoFocus }) => {
    const uid = React.useId();
    const boxRef = useRef<HTMLDivElement>(null);
    // Which value field gets the focus after the next render (new entry, removed entry, opened editor).
    const focusNext = useRef<number | null>(autoFocus ? 0 : null);
    useEffect(() => {
        if (focusNext.current === null || !boxRef.current) return;
        const fields = boxRef.current.querySelectorAll<HTMLInputElement>('input[data-chem-value]');
        const target: HTMLElement | null = fields[focusNext.current] || boxRef.current.querySelector<HTMLButtonElement>('button[data-chem-add]');
        focusNext.current = null;
        target?.focus();
    });

    const shownScheme = (s: string) => CHEM_SCHEMES.find(o => o.toLowerCase() === (s || '').trim().toLowerCase()) || (s || '');
    const update = (i: number, scheme: string, value: string) => onChange(ids.map((id, k) => (k === i ? withLink(id, scheme, value) : id)));
    const remove = (i: number) => { focusNext.current = i; onChange(ids.filter((_, k) => k !== i)); };
    const add = () => {
        const used = ids.map(id => (id.scheme || '').toLowerCase());
        const scheme = !used.includes('cas') ? 'CAS' : !used.includes('inchikey') ? 'InChIKey' : 'CAS';
        focusNext.current = ids.length;
        onChange([...ids, { scheme, value: '', link: '' }]);
    };

    return (
        <div ref={boxRef} className="space-y-2">
            {ids.length === 0 && <p className="hint">{emptyText}</p>}
            {ids.map((id, i) => {
                const scheme = shownScheme(id.scheme);
                const options = CHEM_SCHEMES.includes(scheme) ? CHEM_SCHEMES : [...CHEM_SCHEMES, scheme];
                const problem = chemIdProblem(scheme, id.value);
                const msgId = `${uid}-msg-${i}`;
                return (
                    <div key={i}>
                        <div className="flex items-center gap-1.5">
                            <select
                                value={scheme}
                                onChange={(e) => update(i, e.target.value, id.value || '')}
                                aria-label={`${label}, identifier ${i + 1}: type`}
                                className="field-control w-[108px] shrink-0 text-sm"
                            >
                                {options.map(o => <option key={o || 'other'} value={o}>{o || 'Other'}</option>)}
                            </select>
                            <input
                                data-chem-value
                                value={id.value || ''}
                                onChange={(e) => update(i, scheme, e.target.value)}
                                placeholder={scheme === 'InChIKey' ? 'e.g. XLYOFNOQVPJJNP-UHFFFAOYSA-N' : scheme === 'CAS' ? 'e.g. 7440-50-8' : ''}
                                spellCheck={false}
                                autoComplete="off"
                                aria-label={`${label}, identifier ${i + 1}: ${scheme || 'value'}`}
                                aria-invalid={problem ? true : undefined}
                                aria-describedby={problem ? msgId : undefined}
                                className={`field-control flex-1 min-w-0 text-sm tabular-nums ${problem ? CHECK_FIELD : ''}`}
                            />
                            {safeHttpUrl(id.link)
                                ? <a href={safeHttpUrl(id.link)} target="_blank" rel="noopener noreferrer" className="icon-btn shrink-0" title={`Open the ${scheme} entry`} aria-label={`Open the ${scheme} entry for ${(id.value || '').trim()}`}><Icon name="external" size={14} /></a>
                                : <span className="w-7 shrink-0" aria-hidden="true" />}
                            <button type="button" onClick={() => remove(i)} className="icon-btn-danger shrink-0" title="Remove identifier" aria-label={`Remove ${scheme || 'identifier'} ${(id.value || '').trim()}`.trim()}><Icon name="x" size={14} /></button>
                        </div>
                        {problem && <p id={msgId} className="hint !text-check mt-1">{problem}</p>}
                    </div>
                );
            })}
            <button type="button" data-chem-add onClick={add} className="btn-link text-xs"><Icon name="plus" size={13} /> Add identifier</button>
        </div>
    );
};

export default App;