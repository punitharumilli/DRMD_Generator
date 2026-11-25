#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Bundesanstalt für Materialforschung und -prüfung (BAM)
# SPDX-License-Identifier: EUPL-1.2
"""Write the SCHEMATRON_PATTERNS array of src/utils/drmdBusinessRules.ts from drmd-business-rules.sch.

The official business rules live in the DRMD schema repository. This script copies their patterns,
rule contexts, assertion ids, roles, XPath tests and messages into the generator, with whitespace
collapsed and nothing else changed, and replaces the array in drmdBusinessRules.ts. Afterwards run
`npm run test:rules -- <path of drmd-business-rules.sch>`.

Usage: python3 scripts/rules-from-sch.py ../../drmd-schema/drmd-business-rules.sch
Needs lxml.
"""
import json
import sys
from pathlib import Path

from lxml import etree

SCH = '{http://purl.oclc.org/dsdl/schematron}'
TARGET = Path(__file__).resolve().parent.parent / 'src' / 'utils' / 'drmdBusinessRules.ts'
MARK = 'export const SCHEMATRON_PATTERNS'


def collapse(text):
    return ' '.join((text or '').split())


def patterns(path):
    out = []
    for pattern in etree.parse(str(path)).getroot().iter(SCH + 'pattern'):
        rules = []
        for rule in pattern.iter(SCH + 'rule'):
            checks = [{'kind': c.tag[len(SCH):], 'id': c.get('id'), 'role': c.get('role'),
                       'test': collapse(c.get('test')), 'message': collapse(''.join(c.itertext()))}
                      for c in rule if c.tag in (SCH + 'assert', SCH + 'report')]
            rules.append({'context': collapse(rule.get('context')), 'checks': checks})
        out.append({'id': pattern.get('id'), 'rules': rules})
    return out


def main(argv):
    if len(argv) != 2:
        sys.exit(__doc__)
    text = TARGET.read_text(encoding='utf-8')
    head = text[:text.index(MARK)]
    array = json.dumps(patterns(argv[1]), indent=4, ensure_ascii=False)
    TARGET.write_text(head + f'{MARK}: SchematronPattern[] = {array};\n', encoding='utf-8')
    print(f'written {TARGET}')


if __name__ == '__main__':
    main(sys.argv)
