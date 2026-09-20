"""Audit the delivered SVG without third-party dependencies."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SVG_NS = 'http://www.w3.org/2000/svg'
FORBIDDEN = {'image', 'feImage', 'foreignObject', 'script', 'audio', 'video', 'canvas', 'text', 'style'}


def audit(path):
    data = path.read_bytes()
    assert not re.search(rb'(?:data:|base64|@import|@font-face|<!ENTITY|<!DOCTYPE)', data, re.I)
    svg = ET.fromstring(data)
    counts = Counter(n.get('id') for n in svg.iter() if n.get('id'))
    assert all(c == 1 for c in counts.values()), 'Duplicate IDs'
    ids = {n.get('id'): n for n in svg.iter() if n.get('id')}
    for n in svg.iter():
        assert n.tag.startswith('{'+SVG_NS+'}'), 'Non-SVG element'
        assert n.tag.rsplit('}', 1)[-1] not in FORBIDDEN, n.tag
        for key, value in n.attrib.items():
            name = key.rsplit('}', 1)[-1]
            assert not name.lower().startswith('on'), 'Inline event handler'
            assert not re.search(r'(?:data:|https?://|file:|javascript:)', value, re.I), value
            for reference in re.findall(r'url\(([^)]+)\)', value):
                reference = reference.strip().strip('\'"')
                assert reference.startswith('#') and reference[1:] in ids, reference
            if name == 'href':
                assert value.startswith('#') and value[1:] in ids, value
            if name in {'begin', 'end'}:
                for timing in value.split(';'):
                    match = re.fullmatch(r'([\w-]+)\.(\w+)\+([\d.]+)s', timing)
                    assert match and match[1] in ids, timing
    return svg, ids, hashlib.sha256(data).hexdigest()


base, _, _ = audit(ROOT/'source/controller-base.svg')
svg, ids, digest = audit(ROOT/'controller.svg')
for node in base.iter():
    ident = node.get('id')
    if not ident:
        continue
    assert ident in ids, 'Missing original component: '+ident
    if ident == 'controller':
        assert ids[ident].get('filter') == 'url(#ref-material-finish)'
        assert {k:v for k,v in node.attrib.items() if k != 'filter'} == {
            k:v for k,v in ids[ident].attrib.items() if k != 'filter'}
    elif ident != 'bg-rect':
        assert node.attrib == ids[ident].attrib, 'Changed original geometry: '+ident

screenshot = ROOT/'docs/screenshot.jpg'
assert screenshot.read_bytes().startswith(bytes.fromhex('ffd8ff')), 'Missing JPEG screenshot'
assert 'docs/screenshot.jpg' in (ROOT/'README.md').read_text(encoding='utf-8')
report = {'file': 'controller.svg', 'sha256': digest, 'unique_ids': len(ids),
          'embedded_images': 0, 'external_assets': 0, 'scripts': 0,
          'animation_elements': sum(n.tag.rsplit('}', 1)[-1] in {'animate', 'animateTransform', 'set'} for n in svg.iter()),
          'original_named_geometry': 'preserved', 'documentation_screenshot': 'separate JPEG'}
print(json.dumps(report, indent=2))
