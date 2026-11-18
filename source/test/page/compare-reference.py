# SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
# SPDX-License-Identifier: EUPL-1.2

"""
Compares the verdicts of the published page's D-SI checker (results of harness.js) with the second
implementation of the D-SI rules (dsi_reference.py, written separately from the generator code), in the
same way as dsi-xcheck.py: the same verdict, and for valid expressions the same quality class, size and
dimension. Usage: python3 -I page/compare-reference.py <results.json> [summary.json]
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from dsi_reference import check
from dsi_expressions import expressions

res = json.load(open(sys.argv[1], encoding='utf-8'))
cases = expressions()
assert res.get('expressions', cases) == cases, 'the results are not for the expressions of dsi_expressions.py'
verdicts = res['verdicts']
assert len(verdicts) == len(cases)
diff, rows = [], []
for s, (ok, cls, fac, dim, rules) in zip(cases, verdicts):
    rok, rcls, rfac, rdim = check(s)
    agree = rok == ok and (not ok or (rcls == cls and tuple(dim) == rdim and (rfac is None) == (fac is None) and (rfac is None or abs(rfac - fac) <= 1e-9 * abs(rfac))))
    if not agree: diff.append((s, (ok, cls, fac), (rok, rcls, rfac)))
    rows.append((agree, rok))
valid = sum(1 for v in verdicts if v[0])
ref_valid = sum(1 for a, rok in rows if rok)
summary = {'expressions': len(cases), 'validGenerator': valid, 'validReference': ref_valid, 'invalidGenerator': len(cases) - valid, 'disagreements': len(diff)}
print(f"{len(cases)} D-SI expressions judged by the page and by the independent implementation ({valid} valid, {len(cases) - valid} invalid): {len(diff)} disagreements")
for d in diff[:20]: print('  DISAGREE', d)
if len(sys.argv) > 2: json.dump(summary, open(sys.argv[2], 'w'))
sys.exit(1 if diff else 0)
