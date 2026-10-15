# DRMD AI Generator

Convert reference material certificates and product information sheets from PDF into machine-readable Digital Reference Material Documents (DRMD).

**Version 1.0.0** · Runs in the browser · No installation

---

## Video guide

<!-- VIDEO: add the video link or embed here. -->

*A short video showing how to use the generator will be added here.*

---

## About

Reference material certificates and product information sheets are usually published as PDF documents. People can read them, but software cannot. The DRMD AI Generator reads these documents and converts them into DRMD XML files: a structured, machine-readable format based on the DRMD schema 1.0.0.

- **Extraction:** The content of the PDF is read automatically and placed into a structured form.
- **Review:** Every value can be located in the original PDF. Values that do not appear word for word in the document are marked for verification.
- **Data enrichment:** Units are converted to the D-SI format, and identifiers are added, such as CAS Registry Numbers and InChIKeys for substances and ROR IDs for organisations.
- **Validation:** Each document is checked against the DRMD schema and the official business rules before export.
- **Single documents or whole folders:** Each document is saved as a DRMD XML file together with a readable HTML report.
- **Built-in guidance:** Every field name in the generator links to the matching section of the DRMD Best Practice guide.

---

## Requirements

- Google Chrome 155 or Microsoft Edge 155, or a later version
- An internet connection
- A Google Gemini API key, which you can create in [Google AI Studio](https://aistudio.google.com/apikey). Usage is billed to the account the key belongs to.

Nothing needs to be installed, and no administrator rights are required.

---

## Getting started

1. Download **`DRMD-Generator.html`** from the [latest release](../../releases/latest).
2. Open the file in Chrome or Edge, either by double-clicking it or by dragging it into a browser window.
3. Click **Settings** and enter your Gemini API key.
4. Click **Upload PDF** to convert one document, or **Upload folder** to convert many.

When you convert a folder, the browser asks once for permission to save into it. Choose **Allow**. The XML file and HTML report of each document are saved next to its PDF.

---

## Data and privacy

- The generator runs entirely in your browser. There is no server, and your documents are not stored anywhere else.
- To extract the data, the PDF is sent to Google Gemini using your own API key. Substance and organisation names are looked up at PubChem and ROR.
- Your API key is kept only while the page is open and is not saved.

Please make sure that your documents may be processed by Google Gemini before you use the generator.

> **Note:** Data extracted automatically must be reviewed before the documents are used or published.

---

## Documentation

**DRMD Best Practice guide:** <https://punitharumilli.github.io/BestPracticeDocs/>

The guide explains every element of the DRMD schema and its rules. You can also reach the relevant section directly by clicking any field name in the generator.

---

## License

<!-- LICENSE: add the licence text or a link to the LICENSE file here. -->

Code / Generator: EUPL-1.2 *(details to follow)*

The generator file includes open-source components, each under its own license: React, the Google Gen AI SDK, pdf.js, JSZip and the Inter typeface. Their notices are included in the file.
