# SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
# SPDX-License-Identifier: EUPL-1.2

# Independent reference for the D-SI guide v1.3 (Tables A.1-A.5, R007-R020) plus \percent and \ppm (D-SI 2).
# Written from the guide text, not from the generator's code.
import math, re
P = math.pi
# dims: m kg s A K mol cd angle
def d(m=0,kg=0,s=0,A=0,K=0,mol=0,cd=0,ang=0,info=0): return (m,kg,s,A,K,mol,cd,ang,info)
U = {}
def u(i, cls, f, dim, nopre=False, noexp=False, special=None): U[i] = dict(cls=cls, f=f, dim=dim, nopre=nopre, noexp=noexp, special=special)
# Table A.1 / R017
u('metre','platinum',1,d(1)); u('kilogram','platinum',1,d(0,1),nopre=True); u('second','platinum',1,d(0,0,1))
u('ampere','platinum',1,d(0,0,0,1)); u('kelvin','platinum',1,d(0,0,0,0,1)); u('mole','platinum',1,d(0,0,0,0,0,1)); u('candela','platinum',1,d(0,0,0,0,0,0,1))
# Table A.2 / R017 (one: no prefix, no exponent; day hour minute: R010; degree: Section 3)
u('one','platinum',1,d(),nopre=True,noexp=True); u('day','platinum',86400,d(0,0,1),nopre=True); u('hour','platinum',3600,d(0,0,1),nopre=True)
u('minute','platinum',60,d(0,0,1),nopre=True); u('degree','platinum',P/180,d(ang=1),nopre=True); u('arcminute','platinum',P/10800,d(ang=1)); u('arcsecond','platinum',P/648000,d(ang=1))
# Table A.3 / R018
for i,dm in [('radian',d(ang=1)),('steradian',d(ang=2)),('hertz',d(0,0,-1)),('newton',d(1,1,-2)),('pascal',d(-1,1,-2)),('joule',d(2,1,-2)),('watt',d(2,1,-3)),
             ('coulomb',d(0,0,1,1)),('volt',d(2,1,-3,-1)),('farad',d(-2,-1,4,2)),('ohm',d(2,1,-3,-2)),('siemens',d(-2,-1,3,2)),('weber',d(2,1,-2,-1)),
             ('tesla',d(0,1,-2,-1)),('henry',d(2,1,-2,-2)),('lumen',d(cd=1,ang=2)),('lux',d(-2,cd=1,ang=2)),('becquerel',d(0,0,-1)),('sievert',d(2,0,-2)),('gray',d(2,0,-2)),('katal',d(0,0,-1,0,0,1))]:
    u(i,'gold',1,dm)
u('gram','gold',1e-3,d(0,1)); u('degreecelsius','gold',1,d(0,0,0,0,1),nopre=True,special='affine')
# Table A.4 / R019
u('hectare','silver',1e4,d(2)); u('litre','silver',1e-3,d(3)); u('tonne','silver',1e3,d(0,1)); u('electronvolt','silver',1.602176634e-19,d(2,1,-2))
u('dalton','silver',1.66053906892e-27,d(0,1)); u('astronomicalunit','silver',149597870700,d(1))
u('neper','silver',None,d(),special='log'); u('bel','silver',None,d(),special='log'); u('decibel','silver',None,d(),nopre=True,special='log')
# R020 bronze
u('angstrom','bronze',1e-10,d(1)); u('atomicunittime','bronze',None,d(0,0,1)); u('atomicmassunit','bronze',1.66053906892e-27,d(0,1)); u('bar','bronze',1e5,d(-1,1,-2))
u('barn','bronze',1e-28,d(2)); u('clight','bronze',None,d(1,0,-1)); u('electronmass','bronze',None,d(0,1)); u('elementarycharge','bronze',None,d(0,0,1,1))
u('knot','bronze',1852/3600,d(1,0,-1)); u('mmhg','bronze',133.322387415,d(-1,1,-2),nopre=True); u('naturalunittime','bronze',None,d(0,0,1))
u('nauticalmile','bronze',1852,d(1)); u('hartree','bronze',None,d(2,1,-2)); u('bohr','bronze',None,d(1)); u('planckbar','bronze',None,d(2,1,-1))
# D-SI 2
u('percent','gold',1e-2,d(),nopre=True,noexp=True); u('ppm','gold',1e-6,d(),nopre=True,noexp=True)
# D-SI 2.2.1 unit list: bit, byte (gold), binary prefixes only
u('bit','gold',1,d(info=1)); u('byte','gold',8,d(info=1))
BINARY_ONLY={'bit','byte'}
PRE = dict(ronna=27,quetta=30,ronto=-27,quecto=-30,deca=1,hecto=2,kilo=3,mega=6,giga=9,tera=12,peta=15,exa=18,zetta=21,yotta=24,deci=-1,centi=-2,milli=-3,micro=-6,nano=-9,pico=-12,femto=-15,atto=-18,zepto=-21,yocto=-24)
BIN = dict(kibi=10,mebi=20,gibi=30,tebi=40,pebi=50,exbi=60,zebi=70,yobi=80)
RANK = dict(platinum=0,gold=1,silver=2,bronze=3)
EXP = re.compile(r'^[+-]?(0|[1-9]\d*)$|^[+-]?0\.5$')

def check(s):
    """Returns (ok, cls, factor, dim). Independent tokenizer: guide 1.3 + D-SI 2.2.1 unit list."""
    if s == '' or s.strip() == '': return (False, None, None, None)
    if re.search(r'\s', s) or re.search(r'[A-Z]', s): return (False, None, None, None)
    toks = []  # [prefix, unit, exp, hasexp, den]
    pos = 0; pending = None; per = False; per_at = -1
    for m in re.finditer(r'\\([a-z]+)(\{[^{}]*\})?', s):
        if m.start() != pos: return (False, None, None, None)
        pos = m.end(); name = m.group(1); arg = m.group(2)
        if name == 'tothe':
            if pending or not toks or toks[-1][3] or arg is None or (per and per_at == len(toks)): return (False, None, None, None)
            e = arg[1:-1]
            if not EXP.match(e): return (False, None, None, None)
            toks[-1][2] = float(e); toks[-1][3] = True; continue
        if name == 'per':
            if pending or per or not toks or arg is not None: return (False, None, None, None)
            per = True; per_at = len(toks); continue
        if arg is not None: return (False, None, None, None)
        if (name in PRE or name in BIN) and name not in U:
            if pending: return (False, None, None, None)
            pending = name; continue
        if name not in U: return (False, None, None, None)
        toks.append([pending, name, 1.0, False, per]); pending = None
    if pos != len(s) or pending or not toks or (per and per_at == len(toks)): return (False, None, None, None)
    for t in toks:
        if t[4]: t[2] = -t[2]
    for p, n, e, _, _ in toks:
        if p:
            if (p in BIN) != (n in BINARY_ONLY): return (False, None, None, None)
            if U[n]['nopre'] or (n == 'gram' and p == 'kilo') or (n == 'bel' and p == 'deci'): return (False, None, None, None)
        if e != 1 and U[n]['noexp']: return (False, None, None, None)
    if sum(1 for p,n,e,_,_ in toks if p and e >= 0) > 1: return (False, None, None, None)
    if sum(1 for p,n,e,_,_ in toks if p and e < 0) > 1: return (False, None, None, None)
    rank = 2 if per else 0; f = 1.0; dim = [0]*9
    for p, n, e, _, _ in toks:
        rank = max(rank, RANK[U[n]['cls']], 1 if p else 0)
        sc = 1 if not p else (2**BIN[p] if p in BIN else 10**PRE[p])
        if f is not None and U[n]['f'] is not None: f *= (U[n]['f'] * sc)**e
        else: f = None
        dim = [a + b*e for a, b in zip(dim, U[n]['dim'])]
    return (True, ['platinum','gold','silver','bronze'][rank], f, tuple(dim))
