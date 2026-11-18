# SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
# SPDX-License-Identifier: EUPL-1.2

# Independent calculation of the SI values of si:hybrid for 12.345 (uncertainty 0.012), from the unit
# definitions (NIST SP 811 Appendix B; D-SI guide p. 36 for °F), with the rounding of the D-SI expert
# review (13 November 2026): the converted value keeps the significant digits of the printed value
# (rounded half away from zero); a temperature first moves the zero of its scale (−32 for °F), then the
# exact offset (273.15) is added; the uncertainty is only multiplied by the factor and rounded up to two
# significant digits. Python decimal, written separately from the generator code.
from decimal import Decimal as D, getcontext, ROUND_HALF_UP, ROUND_CEILING
import math
getcontext().prec = 80
PI = D('3.14159265358979323846264338327950288419716939937510582097494459230781640628620899')
F = {  # unit: (factor, zero of the scale moved first, offset added last)
 'lb': (D('0.45359237'), 0, 0), 'ft': (D('0.3048'), 0, 0), 'in': (D('25.4'), 0, 0), 'yd': (D('0.9144'), 0, 0), 'mi': (D('1.609344'), 0, 0),
 'psi': (D('4.4482216152605') / D('0.64516'), 0, 0), 'atm': (D('101.325'), 0, 0), 'Torr': (D(101325) / D(760), 0, 0), 'mTorr': (D(101325) / D(760000), 0, 0),
 'kgf': (D('9.80665'), 0, 0), 'gf': (D('9.80665'), 0, 0), 'kgf/cm²': (D('98.0665'), 0, 0), 'kgf/mm²': (D('9.80665'), 0, 0), 'lbf': (D('4.4482216152605'), 0, 0),
 'mmH2O': (D('9.80665'), 0, 0), 'cmH2O': (D('98.0665'), 0, 0), '°F': (D(5) / D(9), D(-32), D('273.15')), '°R': (D(5) / D(9), 0, 0),
 'Oe': (D(1000) / (4 * PI), 0, 0), 'kOe': (D(1000) / (4 * PI), 0, 0), 'Ci': (D(37), 0, 0), 'mCi': (D(37), 0, 0), 'µCi': (D(37), 0, 0), 'nCi': (D(37), 0, 0), 'pCi': (D(37), 0, 0), 'kCi': (D(37), 0, 0),
}
def exp10(x): return math.floor(abs(x).log10())
def value(s, f, pre, post):
    x = D(s); last = x.as_tuple().exponent          # 12.345: the last printed digit is significant
    xs = x + pre
    n = exp10(xs) - last + 1
    y = xs * f
    q = exp10(y) - n + 1
    r = y.quantize(D(1).scaleb(q), rounding=ROUND_HALF_UP)
    return r + post if post else r
def uncertainty(s, f):
    u = D(s); n = max(2, exp10(u) - u.as_tuple().exponent + 1)
    y = u * f
    q = exp10(y) - n + 1
    return y.quantize(D(1).scaleb(q), rounding=ROUND_CEILING)
for k, (f, pre, post) in F.items():
    print(f"  '{k}': ['{value('12.345', f, pre, post)}', '{uncertainty('0.012', f)}'],")
