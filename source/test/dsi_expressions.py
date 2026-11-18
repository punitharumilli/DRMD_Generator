# SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
# SPDX-License-Identifier: EUPL-1.2

"""
The D-SI expressions of the cross-check (dsi-xcheck.py, and the run on the published page, page/): every
unit identifier with every prefix and exponent, valid and broken, and random products and quotients of
them. Random seed 7, so the same set is made every time.
"""
import random
from dsi_reference import U, PRE, BIN


def expressions():
    random.seed(7)
    units = list(U); pres = [None] + list(PRE) + list(BIN)
    exps = ['', '2', '-1', '3', '-2', '0.5', '-0.5', '+0.5', '0', '1.5', '01', '2.0', '+2', '-0', '1/2', ' 2', 'x']
    def tok(p, n, e): return (f'\\{p}' if p else '') + f'\\{n}' + (f'\\tothe{{{e}}}' if e != '' else '')
    cases = set()
    for n in units:
        for p in pres:
            for e in exps: cases.add(tok(p, n, e))
    for _ in range(60000):
        cases.add(''.join(tok(random.choice(pres) if random.random() < 0.35 else None, random.choice(units), random.choice(exps[:9]) if random.random() < 0.5 else '') for _ in range(random.randint(2, 4))))
    for _ in range(25000):
        side = lambda: ''.join(tok(random.choice(pres) if random.random() < 0.3 else None, random.choice(units), random.choice(exps[:9]) if random.random() < 0.4 else '') for _ in range(random.randint(1, 2)))
        cases.add(side() + '\\per' + side())
    cases.update(['\\milli\\kilo\\metre', '\\metre\\tothe{2}\\tothe{3}', '\\Metre', '\\metre \\second', '\\metres', '\\milligram', '\\kilo\\gram', '\\deci\\bel', '\\milli', '\\tothe{2}',
                  'metre', '\\metre\\', '\\metre{2}', '\\metre\\tothe', '', '\\per\\second', '\\metre\\per', '\\metre\\per\\second\\per\\second', '\\milli\\per\\second', '\\metre\\per\\tothe{2}'])
    cases = sorted(cases)
    return cases
