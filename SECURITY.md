# Security policy

## Reporting a security problem

Please do not describe a security problem in a public issue. Write to [drmd@bam.de](mailto:drmd@bam.de) with the subject "Security: DRMD AI Generator" and give:

- the version shown at the top of the generator,
- what you found and how to reproduce it,
- the browser and its version.

Never send a real API key, also not in a screenshot. If a key of yours may have been exposed, delete it at the provider first and create a new one.

## Supported version

Only the current release, published at <https://punitharumilli.github.io/DRMD_Generator/>, receives corrections.

## Checking that you use the official page

The published page is the file `DRMD-Generator.html` of the main branch of this repository, copied unchanged by the workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml). To check a copy, download the file (for example from <https://punitharumilli.github.io/DRMD_Generator/DRMD-Generator.html>), compute its SHA-256 checksum and compare it with the checksum given in the notes of the release:

- Windows (PowerShell): `Get-FileHash DRMD-Generator.html -Algorithm SHA256`
- macOS and Linux: `shasum -a 256 DRMD-Generator.html`

A page saved with "Save page as" in the browser is rewritten by the browser and has a different checksum.

## How the generator handles your API key

See the section [Security](README.md#security) of the README.
