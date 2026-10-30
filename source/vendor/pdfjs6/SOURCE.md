# pdf.js 6.4.299

Official legacy build of Mozilla pdf.js (Apache-2.0), version 6.4.299, commit d0991a0d5, released 3 October 2026.
The legacy build is the same code as the standard build, prepared by Mozilla for browsers without the newest
JavaScript features (the standard build needs, for example, Map.getOrInsertComputed).

| File | SHA-256 (base64), identical to the npm package `pdfjs-dist@6.4.299` |
|---|---|
| build/pdf.mjs (npm: legacy/build/pdf.mjs) | vFH0h0pm44UxictdUKukswlq+oPtQzuIXSk6PZRYPNw= |
| build/pdf.worker.mjs (npm: legacy/build/pdf.worker.mjs) | u0IvYIBEd95KCwkJHYNHqRajh3Ve0cutJMyuwdCceL8= |
| wasm/jbig2.wasm | Rm9FwqYaaYFS+1QAwn5W/yzrc9y3H94/w2alAjCOqrA= |
| wasm/openjpeg.wasm | leUAJZevCCQASqV7GQD+AZcV2zieN2QLHlg5XkLwDMU= |

The npm package was published by Mozilla's release workflow (GitHub Actions, trusted publishing) with
an SLSA provenance attestation for mozilla/pdf.js, tag v6.4.299, commit d0991a0d53f3bb3a7307e3b83f279c1d117aafb3.
The files were taken from the release archive `pdfjs-6.4.299-legacy-dist.zip` on github.com/mozilla/pdf.js and
compared file by file with the npm package. The only difference was a random identifier that each build
generates (`INTERNAL_EVT` in build/pdf.mjs); it was set to the npm package's value, so build/pdf.mjs is
byte-identical to the attested npm file.

How the build uses them (build.mjs): both files are minified with esbuild and embedded in the page. The
worker is turned into a classic script, because a page opened from disk may not start a module worker
from a blob: address; its one use of `import.meta.url` (the address of its own script) becomes
`self.location.href`, which is the same value. src/utils/pdfjs.ts starts this worker once and hands it
to pdf.js, and supplies the two WebAssembly decoders from the page, so nothing is downloaded.

Check every three months for a newer release and for security advisories:
https://github.com/mozilla/pdf.js/security/advisories
