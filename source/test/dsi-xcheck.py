# SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
# SPDX-License-Identifier: EUPL-1.2

"""
Independent cross-check of the generator's D-SI rule checker (src/utils/dsi.ts, checkDsi).

dsi_reference.py is a second implementation of the rules, written separately from the generator's code,
from the D-SI guide v1.3 (SmartCom, DOI 10.5281/zenodo.3816686: Tables A.1-A.5 pp. 47-54, R007-R020
pp. 71-75) and the D-SI 2.2.1 unit list (PTB, DOI 10.5281/zenodo.12200678). Both implementations judge
the same >100,000 generated D-SI strings (valid and broken ones); every verdict, class, size and
dimension must agree. The expected D-SI units of all scenarios (dsi-scenarios.cjs) are checked too.
Run: python3 -I test/dsi-xcheck.py
"""
import json, os, random, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dsi_reference import U, PRE, BIN, check

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

node = r"""
const esbuild = (() => { try { return require('module').createRequire(process.argv[2])('esbuild'); } catch { return require(process.env.ESBUILD_PATH || '/opt/npm-tools/node_modules/esbuild'); } })();
const out = esbuild.buildSync({ entryPoints: [process.argv[2]], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'error' });
const mod = { exports: {} }; new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
fs.writeFileSync(process.argv[4], JSON.stringify(input.map(s => { const c = mod.exports.checkDsi(s); return { ok: c.ok, cls: c.cls, factor: c.factor, dim: c.dim }; })));
"""
with tempfile.TemporaryDirectory() as tmp:
    inp, outp, js = os.path.join(tmp, 'in.json'), os.path.join(tmp, 'out.json'), os.path.join(tmp, 'run.cjs')
    with open(inp, 'w') as f: json.dump(cases, f)
    with open(js, 'w') as f: f.write(node)
    subprocess.run(['node', js, os.path.join(HERE, '..', 'src', 'utils', 'dsi.ts'), inp, outp], check=True)
    out = json.load(open(outp))
diff = []
for s, o in zip(cases, out):
    ok, cls, fac, dim = check(s)
    if ok != o['ok'] or (ok and (cls != o['cls'] or tuple(o['dim']) != dim or (fac is None) != (o['factor'] is None) or (fac is not None and abs(fac - o['factor']) > 1e-9 * abs(fac)))):
        diff.append((s, (ok, cls, fac), (o['ok'], o['cls'], o['factor'])))
valid = sum(1 for s in cases if check(s)[0])
print(f'{len(cases)} D-SI strings judged by both implementations ({valid} valid, {len(cases) - valid} broken): {len(diff)} disagreements')
for d in diff[:20]: print('  DISAGREE', d)

# The expected D-SI units of all scenarios are valid D-SI by the independent implementation
scen = json.loads(subprocess.run(['node', '-e', "console.log(JSON.stringify(require(process.argv[1]).SCENARIOS))", os.path.join(HERE, 'dsi-scenarios.cjs')], capture_output=True, text=True, check=True).stdout)
bad = [s for s in scen if s['expect'] and not check(s['expect'])[0]]
print(f"{sum(1 for s in scen if s['expect'])} expected D-SI units of the scenarios are valid D-SI by the independent implementation: {len(bad)} invalid")
for b in bad[:20]: print('  INVALID EXPECTATION', b['unit'], b['expect'])
summary = {'strings': len(cases), 'valid': valid, 'broken': len(cases) - valid, 'disagreements': len(diff), 'expectations': sum(1 for s in scen if s['expect']), 'invalidExpectations': len(bad)}
os.makedirs(os.path.join(HERE, 'out-matrix'), exist_ok=True)
json.dump(summary, open(os.path.join(HERE, 'out-matrix', 'xcheck.json'), 'w'))
print('RESULT', 'PASS' if not diff and not bad else 'FAIL')
sys.exit(0 if not diff and not bad else 1)
