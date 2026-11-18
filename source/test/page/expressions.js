// SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
// SPDX-License-Identifier: EUPL-1.2

// The D-SI expressions of the cross-check (dsi_expressions.py) made in JavaScript, for a browser that
// has no Python: the same lists, and Python's random number generator (Mersenne Twister MT19937 as
// random.seed, random.random, random.choice and random.randint use it), so that the very same 120,388
// expressions come out. The page compares the SHA-256 of the list with the value of the Python list.
// lists: { units, pre, bin } in the order of dsi_reference.py (U, PRE, BIN).
const drmdExpressions = (lists) => {
  // MT19937 with Python's seeding of an integer (init_by_array with the 32-bit words of the seed)
  const N = 624, M = 397, mt = new Uint32Array(N); let mti = N + 1;
  const mul = (a, b) => (((((a & 0xffff0000) >>> 16) * b) << 16) + (a & 0x0000ffff) * b) >>> 0;
  const initGenrand = (s) => { mt[0] = s >>> 0; for (mti = 1; mti < N; mti++) mt[mti] = (mul(mt[mti - 1] ^ (mt[mti - 1] >>> 30), 1812433253) + mti) >>> 0; };
  const initByArray = (key) => {
    initGenrand(19650218); let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k; k--) {
      mt[i] = ((mt[i] ^ mul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0; i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; } if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k; k--) {
      mt[i] = ((mt[i] ^ mul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0; i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  };
  const genrand = () => {
    let y;
    if (mti >= N) {
      let kk;
      for (kk = 0; kk < N - M; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      for (; kk < N - 1; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff); mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      mti = 0;
    }
    y = mt[mti++];
    y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
    return y >>> 0;
  };
  const random = () => { const a = genrand() >>> 5, b = genrand() >>> 6; return (a * 67108864 + b) / 9007199254740992; };
  const getrandbits = (k) => genrand() >>> (32 - k); // k <= 32
  const randbelow = (n) => { const k = n.toString(2).length; let r = getrandbits(k); while (r >= n) r = getrandbits(k); return r; };
  const choice = (a) => a[randbelow(a.length)];
  const randint = (a, b) => a + randbelow(b - a + 1);
  initByArray([7]);
  const units = lists.units, pres = [null, ...lists.pre, ...lists.bin];
  const exps = ['', '2', '-1', '3', '-2', '0.5', '-0.5', '+0.5', '0', '1.5', '01', '2.0', '+2', '-0', '1/2', ' 2', 'x'];
  const tok = (p, n, e) => (p ? `\\${p}` : '') + `\\${n}` + (e !== '' ? `\\tothe{${e}}` : '');
  const cases = new Set();
  for (const n of units) for (const p of pres) for (const e of exps) cases.add(tok(p, n, e));
  for (let i = 0; i < 60000; i++) {
    const m = randint(2, 4); let s = '';
    // Python evaluates the generator expression's arguments left to right: prefix, unit, exponent
    for (let j = 0; j < m; j++) { const p = random() < 0.35 ? choice(pres) : null; const n = choice(units); const e = random() < 0.5 ? choice(exps.slice(0, 9)) : ''; s += tok(p, n, e); }
    cases.add(s);
  }
  for (let i = 0; i < 25000; i++) {
    const side = () => { const m = randint(1, 2); let s = ''; for (let j = 0; j < m; j++) { const p = random() < 0.3 ? choice(pres) : null; const n = choice(units); const e = random() < 0.4 ? choice(exps.slice(0, 9)) : ''; s += tok(p, n, e); } return s; };
    const a = side(), b = side();
    cases.add(a + '\\per' + b);
  }
  for (const s of ['\\milli\\kilo\\metre', '\\metre\\tothe{2}\\tothe{3}', '\\Metre', '\\metre \\second', '\\metres', '\\milligram', '\\kilo\\gram', '\\deci\\bel', '\\milli', '\\tothe{2}',
    'metre', '\\metre\\', '\\metre{2}', '\\metre\\tothe', '', '\\per\\second', '\\metre\\per', '\\metre\\per\\second\\per\\second', '\\milli\\per\\second', '\\metre\\per\\tothe{2}']) cases.add(s);
  // Python sorts str by code point; for these ASCII strings that is the order of JavaScript's default sort
  return Array.from(cases).sort();
};
if (typeof module !== 'undefined') module.exports = { drmdExpressions };

// The lists of dsi_reference.py, read from its text (units in the order they are defined; the prefixes
// of PRE and BIN in their order), so that the browser needs no other copy of them.
const drmdReferenceLists = (py) => {
  const units = [];
  for (const m of py.matchAll(/(?:\bu\(\s*'([a-z]+)'|\(\s*'([a-z]+)'\s*,\s*d\()/g)) { const n = m[1] || m[2]; if (!units.includes(n)) units.push(n); }
  const keys = (name) => { const m = py.match(new RegExp(`^${name} = dict\\(([^)]*)\\)`, 'm')); return m ? m[1].split(',').map(x => x.split('=')[0].trim()) : []; };
  return { units, pre: keys('PRE'), bin: keys('BIN') };
};
if (typeof module !== 'undefined') module.exports.drmdReferenceLists = drmdReferenceLists;
