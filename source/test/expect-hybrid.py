# SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
# SPDX-License-Identifier: EUPL-1.2

# Independent calculation of the SI values of si:hybrid for 12.345 (uncertainty 0.012), from the unit
# definitions (NIST SP 811 Appendix B; D-SI guide p. 36 for °F), rounded two digits finer than the
# printed resolution times the factor, half away from zero.
from decimal import Decimal as D, getcontext, ROUND_HALF_UP
import math
getcontext().prec = 60
PI = D('3.14159265358979323846264338327950288419716939937510582097494459')
F = {
 'lb': (D('0.45359237'), 0), 'ft': (D('0.3048'), 0), 'in': (D('25.4'), 0), 'yd': (D('0.9144'), 0), 'mi': (D('1.609344'), 0),
 'psi': (D('4.4482216152605') / D('0.64516'), 0), 'atm': (D('101.325'), 0), 'Torr': (D(101325) / D(760), 0), 'mTorr': (D(101325) / D(760000), 0),
 'kgf': (D('9.80665'), 0), 'gf': (D('9.80665'), 0), 'kgf/cm²': (D('98.0665'), 0), 'kgf/mm²': (D('9.80665'), 0), 'lbf': (D('4.4482216152605'), 0),
 'mmH2O': (D('9.80665'), 0), 'cmH2O': (D('98.0665'), 0), '°F': (D(5) / D(9), D(45967) / D(180)), '°R': (D(5) / D(9), 0),
 'Oe': (D(1000) / (4 * PI), 0), 'kOe': (D(1000) / (4 * PI), 0), 'Ci': (D(37), 0), 'mCi': (D(37), 0), 'µCi': (D(37), 0), 'nCi': (D(37), 0), 'pCi': (D(37), 0), 'kCi': (D(37), 0),
}
def conv(s, factor, off, unc=False):
    x = D(s); last = x.as_tuple().exponent
    y = x * factor + (0 if unc else off)
    q = last + math.floor((factor).log10()) - 2
    r = y.quantize(D(1).scaleb(q), rounding=ROUND_HALF_UP)
    return r
for k, (f, o) in F.items():
    v = conv('12.345', f, o); u = conv('0.012', f, o, True)
    print(f"  '{k}': ['{v}', '{u}'],")
