// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// Embeds Inter (regular, italic, medium, semibold, bold) as base64 @font-face rules (dist/fonts.css).
// vendor/inter/subset holds Inter 4.1 subset to Latin, Greek, punctuation and technical symbols.
// Inter is licensed under the SIL Open Font License 1.1, which permits embedding.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACES = [['Regular', 400, 'normal'], ['Italic', 400, 'italic'], ['Medium', 500, 'normal'], ['SemiBold', 600, 'normal'], ['Bold', 700, 'normal']];
let css = '';
for (const [style, weight, fstyle] of FACES) {
  const data = fs.readFileSync(path.join(ROOT, 'vendor/inter/subset', `Inter-${style}.woff2`)).toString('base64');
  css += `@font-face{font-family:'Inter';font-style:${fstyle};font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');}`;
}
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/fonts.css'), css);
console.log('fonts.css', (css.length / 1024).toFixed(0), 'kB');
