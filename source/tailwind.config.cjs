// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

/** Design tokens for the DRMD Generator. */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Text
        ink: { DEFAULT: '#1c2630', soft: '#3c4955', muted: '#5f6b77', faint: '#8b96a1' },
        // Hairlines and surfaces
        line: { DEFAULT: '#d9dee3', strong: '#c2c9d0', soft: '#e9ecef' },
        canvas: '#f2f4f6',
        sunken: '#f7f8f9',
        // The dark "desk" the certificate lies on
        desk: { DEFAULT: '#38414a', raised: '#434c56', line: '#4d5761', text: '#c9d0d6' },
        // Accent: petrol blue
        petrol: {
          50: '#eef5f7', 100: '#d7e8ed', 200: '#afd0da', 300: '#7fb1c1',
          500: '#2f7487', 600: '#1d6276', 700: '#174f60', 800: '#123f4c', 900: '#0d2f39',
        },
        // Status colours carry meaning: conform / check (conditional) / error / note
        ok: { DEFAULT: '#2c7349', bg: '#e9f4ed', line: '#b9dcc5' },
        check: { DEFAULT: '#94560a', bg: '#fbf1e2', line: '#efd1a6' },
        bad: { DEFAULT: '#b3261e', bg: '#fcebea', line: '#f2c3bf' },
        note: { DEFAULT: '#6d5d10', bg: '#faf5dc', line: '#e8dc9c' },
        marker: '#ffd84d',
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        // Only the XML code view uses a monospace face.
        mono: ['Consolas', '"Cascadia Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '14px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        md: ['15px', '22px'],
        lg: ['17px', '24px'],
        xl: ['20px', '28px'],
      },
      borderRadius: { sm: '3px', DEFAULT: '4px', md: '6px', lg: '8px' },
      boxShadow: {
        panel: '0 1px 2px rgba(28, 38, 48, 0.06)',
        float: '0 6px 24px rgba(28, 38, 48, 0.18), 0 1px 3px rgba(28, 38, 48, 0.12)',
        paper: '0 2px 10px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
};
