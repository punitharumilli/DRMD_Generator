# DRMD AI Generator

Convert reference material certificates and product information sheets from PDF into machine-readable Digital Reference Material Documents (DRMD).

**Version 1.0.0** · Runs in the browser · No installation · **[Open the generator](https://punitharumilli.github.io/DRMD_Generator/)**

---

## Video guide

[![Video guide for the DRMD AI Generator. Click to watch the video.](video/video-guide-preview.jpg)](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator)

A 12-minute walkthrough of every step, from entering the API key to converting a whole folder, with spoken explanation and captions. Click the picture to watch it on the DRMD video site, with chapters, a transcript and a download option.

**Chapters.** Click a time to start the video at that point.

| Time | Chapter |
|---:|---|
| [0:00](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator) | Introduction |
| [0:20](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=20) | Getting started |
| [0:52](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=52) | Settings and API key |
| [1:27](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=87) | Converting a certificate |
| [2:42](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=162) | Administrative data |
| [5:04](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=304) | Materials |
| [5:32](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=332) | Properties |
| [7:36](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=456) | Checking values |
| [8:24](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=504) | Statements |
| [8:45](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=525) | Comment and documents |
| [9:11](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=551) | Validate and export |
| [10:39](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=639) | Converting a folder |
| [12:02](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=722) | Importing an XML file |
| [12:15](https://punitharumilli.github.io/DRMD_Videos/?v=drmd-ai-generator&t=735) | Summary |

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

1. Open the generator in Chrome or Edge, in one of two ways:
   - **Online:** go to <https://punitharumilli.github.io/DRMD_Generator/>
   - **As a file:** download **`DRMD-Generator.html`** from the [latest release](../../releases/latest) and open it, either by double-clicking it or by dragging it into a browser window.
2. Click **Settings** and enter your Gemini API key.
3. Click **Upload PDF** to convert one document, or **Upload folder** to convert many.

When you convert a folder, the browser asks once for permission to save into it. Choose **Allow**. The XML file and HTML report of each document are saved next to its PDF.

---

## Data and privacy

- The generator runs entirely in your browser, whether you open it online or as a file. There is no server, and your documents are not uploaded to GitHub or stored anywhere else.
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
