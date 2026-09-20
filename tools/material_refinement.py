"""Native SVG material detail; the measured silhouettes and hit targets stay intact."""
import copy
import math
import xml.etree.ElementTree as ET

NS = 'http://www.w3.org/2000/svg'


def refine(root):
    ids = {e.get('id'): e for e in root.iter() if e.get('id')}

    def el(tag, parent, **attrs):
        child = ET.SubElement(parent, '{'+NS+'}'+tag,
                              {k.replace('_', '-'): str(v) for k, v in attrs.items()})
        return child

    defs = el('defs', root, id='ref-material-definitions')

    def radial(ident, stops, **attrs):
        grad = el('radialGradient', defs, id=ident, **attrs)
        for offset, color, opacity in stops:
            el('stop', grad, offset=offset, stop_color=color, stop_opacity=opacity)
        return 'url(#'+ident+')'

    def arc(group, cx, cy, rx, ry, start, end, **attrs):
        a, b = math.radians(start), math.radians(end)
        d = (f'M{cx+rx*math.cos(a):.3f},{cy+ry*math.sin(a):.3f} '
             f'A{rx},{ry} 0 {int(abs(end-start)>180)} 1 '
             f'{cx+rx*math.cos(b):.3f},{cy+ry*math.sin(b):.3f}')
        return el('path', group, d=d, fill='none', stroke_linecap='round', **attrs)

    # The old photographic finish softened every component twice. Keep a restrained
    # material grain while letting the newly drawn mould edges survive small views.
    finish = copy.deepcopy(ids['fin-grade'])
    finish.set('id', 'ref-material-finish')
    for child in finish:
        result = child.get('result')
        if result == 'soft0':
            child.set('stdDeviation', '.22')
        elif result == 'bleed0':
            child.set('stdDeviation', '.7')
        elif result == 'matte':
            child.set('stdDeviation', '.4')
        elif result == 'grained':
            child.attrib.update(k1='-.068', k2='1.034', k3='.07', k4='-.035')
    defs.append(finish)
    ids['controller'].set('filter', 'url(#ref-material-finish)')

    pattern = el('pattern', defs, id='ref-rubber-stipple', patternUnits='userSpaceOnUse',
                 width='11', height='11')
    for x, y, radius in [(2.1, 2.7, .72), (7.8, 5.3, .64), (4.4, 9.1, .55)]:
        el('circle', pattern, cx=x, cy=y+.65, r=radius, fill='#182b2c', opacity='.28')
        el('circle', pattern, cx=x-.25, cy=y-.3, r=radius*.8, fill='#dbe4df', opacity='.2')

    dish = radial('ref-rubber-dish', [
        ('0', '#182b2d', '.20'), ('.55', '#223435', '.12'),
        ('.84', '#4e6261', '0'), ('1', '#e8eeea', '.1')], cx='.44', cy='.34', r='.65')
    bevel = radial('ref-rubber-bevel', [
        ('0', '#c3d0ca', '0'), ('.82', '#c3d0ca', '0'),
        ('.92', '#d3ded7', '.08'), ('1', '#182c2c', '.32')], cx='.5', cy='.5', r='.5')
    for side, cx, cy, rx, ry, rotation in [
            ('L', 968, 330.5, 166, 140, -18.5),
            ('R', 1851, 1092.5, 171, 150, -14.5)]:
        parent = ids['int-stick-cap-'+side]
        group = el('g', parent, id='ref-rubber-'+side, pointer_events='none',
                   clip_path=f'url(#st-{side}-cRidge)')
        g = el('g', group, transform=f'rotate({rotation} {cx} {cy})')
        el('ellipse', g, cx=cx, cy=cy, rx=rx-2, ry=ry-2, fill=dish)
        el('ellipse', g, cx=cx, cy=cy, rx=rx-3, ry=ry-3, fill='url(#ref-rubber-stipple)')
        el('ellipse', g, cx=cx, cy=cy, rx=rx-2, ry=ry-2, fill=bevel)
        arc(g, cx, cy, rx-2.5, ry-2.5, 193, 344,
            stroke='#cedad3', stroke_width='1.65', stroke_opacity='.44')
        arc(g, cx, cy, rx-1, ry-1, 12, 164,
            stroke='#304342', stroke_width='2.0', stroke_opacity='.36')
        arc(g, cx, cy, rx*.80, ry*.79, 23, 136,
            stroke='#c3d1c9', stroke_width='1.3', stroke_opacity='.26')

    # Precise optical edges follow each original measured jewel silhouette.
    edge = el('linearGradient', defs, id='ref-jewel-edge', x1='0', y1='0', x2='.7', y2='1')
    for offset, color, opacity in [('0', '#182c29', '.55'), ('.3', '#ffffff', '.28'),
                                    ('.63', '#ffffff', '.68'), ('1', '#223128', '.38')]:
        el('stop', edge, offset=offset, stop_color=color, stop_opacity=opacity)
    caustic = radial('ref-jewel-specular', [
        ('0', '#ffffff', '.33'), ('.34', '#ffffff', '.13'), ('1', '#ffffff', '0')],
        cx='.66', cy='.88', r='.35')
    for key, cx, cy, rx, ry in [('A',2358.1,1078.3,96,89), ('B',2632.2,968.4,96,90),
                               ('X',2237.6,829.1,96,90), ('Y',2509.3,716.4,97,91)]:
        parent = ids['int-plunger-'+key]
        group = el('g', parent, id='ref-jewel-'+key, pointer_events='none',
                   clip_path=f'url(#ab-{key}-cS)')
        outline = next(iter(ids['ab-'+key+'-cS'])).get('d')
        el('path', group, d=outline, fill='none', stroke='url(#ref-jewel-edge)', stroke_width='2.1')
        el('ellipse', group, cx=cx, cy=cy, rx=rx, ry=ry, fill=caustic)
        # Keep the measured letter outline and its internal counters.
        letter = next((e for e in parent.iter() if e.get('fill') == f'url(#ab-{key}-face)'), None)
        if letter is not None:
            relief = copy.deepcopy(letter)
            relief.attrib.pop('id', None)
            relief.attrib.pop('filter', None)
            relief.attrib.update(fill='none', stroke='#f2f6e7', **{
                'stroke-width': '.85', 'stroke-opacity': '.30', 'stroke-linejoin': 'round'})
            group.append(relief)

    chrome = el('g', ids['int-guide-cap'], id='ref-chrome-bevel',
                clip_path='url(#ct-c-dome)', pointer_events='none',
                transform='rotate(-12.1 1703.9 681.6)')
    arc(chrome, 1703.9, 681.6, 131.1, 119.6, 193, 317,
        stroke='#ffffff', stroke_width='2.1', stroke_opacity='.78')
    arc(chrome, 1703.9, 681.6, 130.7, 119.2, 7, 156,
        stroke='#29352f', stroke_width='2.3', stroke_opacity='.44')
    arc(chrome, 1703.9, 681.6, 128.8, 117.4, 26, 111,
        stroke='#eff5ed', stroke_width='1.0', stroke_opacity='.38')

    rim = el('linearGradient', defs, id='ref-shell-rim-paint', x1='0', y1='0', x2='1', y2='1')
    for offset, color, opacity in [('0', '#ffffff', '.75'), ('.37', '#b7c2ba', '.06'),
                                    ('.7', '#6c7c71', '.1'), ('1', '#53665c', '.22')]:
        el('stop', rim, offset=offset, stop_color=color, stop_opacity=opacity)
    shell_edge = copy.deepcopy(next(iter(ids['sh-clip'])))
    shell_edge.attrib.update(id='ref-shell-seam', fill='none', stroke='url(#ref-shell-rim-paint)',
                             **{'stroke-width': '2.0', 'pointer-events': 'none'})
    ids['sh-body'].append(shell_edge)

    desc = el('desc', root, id='ref-material-notes')
    desc.text = ('Refined rubber concavity and moulded microtexture, precise jewel rims, '
                 'letter relief, chrome bevels and shell edges. All material detail is '
                 'native SVG geometry and gradients; original measured silhouettes are retained.')
