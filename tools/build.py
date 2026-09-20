"""Add declarative SVG controls and material refinements to the measured vector artwork.

The delivered SVG contains no script, bitmap, audio asset, or external resource.
Font outlines are generated here, not loaded by the SVG at runtime.
"""
from pathlib import Path
import argparse
from math import cos, sin, pi
import json
import re
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from material_refinement import refine

ROOT = Path(__file__).resolve().parents[1]
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
parser = argparse.ArgumentParser(description='Build the standalone interactive controller SVG.')
parser.add_argument('--font', type=Path, help='TrueType font for outlined control-panel labels')
args = parser.parse_args()
tree = ET.parse(ROOT / 'source/controller-base.svg')
root = tree.getroot()
root.attrib.update(id='int-root', width='100%', height='100%',
                   viewBox='-330 -270 3580 3470', preserveAspectRatio='xMidYMid meet',
                   role='group', **{'aria-label': 'Interactive Xbox 360 controller'})


def node(tag, parent=None, **attrs):
    el = ET.Element('{' + SVG + '}' + tag, {k.replace('_', '-'): str(v) for k, v in attrs.items()})
    if parent is not None:
        parent.append(el)
    return el


def get(ident):
    return next(e for e in root.iter() if e.get('id') == ident)


def parent(el):
    return next(p for p in root.iter() if el in list(p))


def wrap(el, ident):
    p = parent(el)
    i = list(p).index(el)
    g = node('g', id=ident)
    p.remove(el)
    p.insert(i, g)
    g.append(el)
    return g


font_candidates = ([args.font] if args.font else []) + [
    Path('/System/Library/Fonts/Supplemental/Arial.ttf'),
    Path('/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'),
    Path('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'),
    Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
    Path('C:/Windows/Fonts/arial.ttf'),
]
font_path = next((p for p in font_candidates if p.is_file()), None)
if font_path is None:
    parser.error('No supported system font found. Supply --font /path/to/font.ttf')
if args.font and font_path != args.font:
    parser.error('The font supplied with --font does not exist')
font = TTFont(font_path)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm


def label(p, text, x, y, size=38, fill='#3f484b', tracking=1, center=False):
    width = sum(glyphs[cmap[ord(ch)]].width * size / upm + tracking for ch in text) - tracking
    x -= width / 2 if center else 0
    parts = []
    for ch in text:
        glyph = glyphs[cmap[ord(ch)]]
        pen = SVGPathPen(glyphs, ntos=lambda n: f'{n:.2f}')
        glyph.draw(TransformPen(pen, (size / upm, 0, 0, -size / upm, x, y)))
        parts.append(pen.getCommands())
        x += glyph.width * size / upm + tracking
    return node('path', p, d=' '.join(parts), fill=fill, aria_hidden='true', pointer_events='none')


def events(ids, event='click', delay=''):
    return ';'.join(f'{ident}.{event}{delay}' for ident in ids)


def action_events(ids):
    return events(ids) + ';' + events(ids, 'keypress')


ON_IDS = ['int-guide-on', 'int-ui-on']
OFF_IDS = ['int-guide-off', 'int-ui-off', 'int-reset']
ON = action_events(ON_IDS)
OFF = action_events(OFF_IDS)
RESET = action_events(['int-reset'])
RELEASE = 'int-root.pointerup+0.001s;int-root.pointercancel+0.001s;int-root.click+0.001s;' + RESET


def interactive(p, ident, name):
    g = node('g', p, id=ident, role='button', tabindex='0', aria_label=name, cursor='pointer')
    node('title', g).text = name
    return g


def hit_ellipse(p, ident, name, cx, cy, rx, ry, rotation=0):
    g = interactive(p, ident, name)
    node('ellipse', g, cx=cx, cy=cy, rx=rx, ry=ry, fill='#ffffff', fill_opacity='.001',
         pointer_events='all', transform=f'rotate({rotation} {cx} {cy})')
    return g


def press(target, ident, dx=-1, dy=10):
    node('animateTransform', target, id=ident+'-held', attributeName='transform', type='translate',
         **{'from':f'{dx} {dy}'}, to=f'{dx} {dy}', begin=ident+'.pointerdown',
         end=RELEASE+';'+ident+'.pointerleave+0.001s', dur='indefinite')
    node('animateTransform', target, id=ident+'-up', attributeName='transform', type='translate',
         values=f'{dx} {dy};0 -0.7;0 0', keyTimes='0;.75;1',
         begin=ident+'-held.end', dur='.14s', fill='remove')
    node('animateTransform', target, id=ident+'-key', attributeName='transform', type='translate',
         values=f'0 0;{dx} {dy};{dx} {dy};0 -1;0 0', keyTimes='0;.2;.5;.8;1',
         begin=ident+'.keypress', dur='.32s', fill='remove')


node('desc', root).text = ('Original measured vector artwork with SVG SMIL interaction. '
    'Click the Guide button to switch the player ring on or off. Press the face buttons, '
    'Back and Start; hold stick or D-pad edges. The bottom controls rotate, tilt, and '
    'animate rumble. Rotation and rumble are visual simulations of this front view. '
    'This SVG has no audio, physical haptics, JavaScript, bitmap, or external assets.')
get('bg-rect').attrib.update(x='-330', y='-270', width='3580', height='3470')

# Leave the original art and its definitions intact; move only the physical caps.
controller = get('controller')
orbit = wrap(controller, 'int-orbit')
spin_axis = wrap(controller, 'int-spin-axis')
spin_pivot = wrap(controller, 'int-spin-pivot')
spin_pivot.set('transform', 'translate(1460 1260)')
spin_fit = wrap(controller, 'int-spin-fit')
spin_unpivot = wrap(controller, 'int-spin-unpivot')
spin_unpivot.set('transform', 'translate(-1460 -1260)')
tilt_pivot = wrap(controller, 'int-tilt-pivot')
tilt_pivot.set('transform', 'translate(1460 1260)')
tilt = wrap(controller, 'int-tilt')
tilt_scale = wrap(controller, 'int-tilt-scale')
unpivot = wrap(controller, 'int-unpivot')
unpivot.set('transform', 'translate(-1460 -1260)')
rumble_low = wrap(controller, 'int-rumble-low')
rumble_high = wrap(controller, 'int-rumble-high')
shadow = get('bg-shadow')
parent(shadow).remove(shadow)
rumble_high.insert(0,shadow)
hits = node('g', rumble_high, id='int-hit-targets')

for key, cx, cy, rx, ry in [('A', 2358.1, 1078.3, 96, 89), ('B', 2632.2, 968.4, 96, 90),
                            ('X', 2237.6, 829.1, 96, 90), ('Y', 2509.3, 716.4, 97, 91)]:
    button = get('ab-btn-'+key)
    face = next(e for e in button if e.tag.endswith('g'))
    plunger = wrap(face, 'int-plunger-'+key)
    press(plunger, 'int-hit-'+key, -1.5, 10)
    hit_ellipse(hits, 'int-hit-'+key, 'Press '+key, cx, cy, rx, ry, -12)
    # A pressed dome catches less light along its upper bevel.
    reflection = node('g', face, opacity='0', pointer_events='none', clip_path=f'url(#ab-{key}-cS)')
    node('ellipse', reflection, cx=cx-5, cy=cy-24, rx=rx-12, ry=ry-28,
         fill='none', stroke='#ffffff', stroke_width='2.2', stroke_opacity='.65')
    node('set', reflection, attributeName='opacity', to='.35', begin='int-hit-'+key+'.pointerdown',
         end=RELEASE+';int-hit-'+key+'.pointerleave', dur='indefinite')

for ident, cx, cy, rx, ry, rot in [('back',1444.1,589,67.8,55.2,5.1),
                                ('start',1963.5,760.3,68.5,56.6,9.9)]:
    button = get('ct-'+ident)
    face = node('g', id='int-plunger-'+ident)
    for child in list(button)[:2]:
        button.remove(child)
        face.append(child)
    button.insert(0, face)
    press(face, 'int-hit-'+ident, -1, 7)
    hit_ellipse(hits, 'int-hit-'+ident, 'Press '+ident.title(), cx,cy,rx,ry,rot)


def direction_hits(ident, cx, cy, rx, ry, target, travel=25):
    for name, start, dx, dy in [('right',-pi/4,travel,0),('down',pi/4,0,travel),
                               ('left',3*pi/4,-travel,0),('up',5*pi/4,0,-travel)]:
        h = interactive(hits, ident+'-'+name, 'Hold '+ident.removeprefix('int-').replace('-',' ')+' '+name)
        points = [f'{cx+rx*cos(start+i*pi/16):.3f},{cy+ry*sin(start+i*pi/16):.3f}' for i in range(9)]
        node('path',h,d=f'M{cx},{cy} L'+ ' L'.join(points)+' Z',fill='#ffffff',fill_opacity='.001',pointer_events='all')
        press(target, ident+'-'+name, dx, dy)


for side, cx, cy, rx, ry in [('L',968,330.5,160,140),('R',1851,1092.5,166,142)]:
    stick = get('st-'+side)
    cap = next(e for e in stick if e.get('mask') == f'url(#st-{side}-mSil)')
    movable = wrap(cap, 'int-stick-cap-'+side)
    direction_hits('int-stick-'+side.lower(), cx,cy,rx,ry,movable,30)
    click_id='int-stick-'+side.lower()+'-click'
    press(movable,click_id,0,11)
    hit_ellipse(hits,click_id,'Press '+('left' if side=='L' else 'right')+' stick',cx,cy,42,38)

disc = get('dp-disc')
disc_wrap = wrap(disc, 'int-dpad-cap')
for ident in ['dp-specks','dp-grain-disc']:
    el=get(ident)
    parent(el).remove(el)
    disc_wrap.append(el)
direction_hits('int-dpad',1144,899,185,168,disc_wrap,8)

# Four physical ring segments. ABXY remain translucent plastic, without invented LEDs.
guide = get('ct-guide')
dome = next(e for e in guide if e.get('clip-path')=='url(#ct-c-dome)')
dome_cap = wrap(dome,'int-guide-cap')
for ident in ['int-guide-on','int-guide-off']:
    press(dome_cap,ident,-1,6)

light = node('g',guide,id='int-power-light',opacity='0',pointer_events='none')
node('set',light,attributeName='opacity',to='1',begin=ON,end=OFF,dur='indefinite')
defs = node('defs',root,id='int-defs')
glow = node('radialGradient',defs,id='int-led-spill')
node('stop',glow,offset='0',stop_color='#9cff39',stop_opacity='0')
node('stop',glow,offset='.58',stop_color='#9cff39',stop_opacity='0')
node('stop',glow,offset='.7',stop_color='#9cff39',stop_opacity='.10')
node('stop',glow,offset='1',stop_color='#9cff39',stop_opacity='0')
node('ellipse',light,cx='1702.3',cy='676.55',rx='207',ry='189',fill='url(#int-led-spill)')
for i in range(4):
    a,b=(190+90*i)*pi/180,(260+90*i)*pi/180
    cx,cy,rx,ry=1702.3,676.55,148,132
    d=f'M{cx+rx*cos(a):.3f},{cy+ry*sin(a):.3f} A{rx},{ry} 0 0 1 {cx+rx*cos(b):.3f},{cy+ry*sin(b):.3f}'
    segment=node('g',light,id=f'int-led-{i+1}',opacity='0',transform=f'rotate(-13.4 {cx} {cy})')
    for width,color,opacity in [(22,'#8dff3c',.08),(15,'#8dff3c',.2),(9,'#74dc19',.75),(4.5,'#b2ff61',1),(1.4,'#e8ffd0',.8)]:
        node('path',segment,d=d,fill='none',stroke=color,stroke_width=width,stroke_opacity=opacity,stroke_linecap='round')
    starts=';'.join(f'{s}+{i*.1:.1f}s' for s in ON.split(';'))
    node('animate',segment,attributeName='opacity',values='0;1;.2;1;0',keyTimes='0;.15;.45;.75;1',
         begin=starts,end=OFF,dur='.85s',fill='remove')
    if i==0:
        node('set',segment,attributeName='opacity',to='1',begin=';'.join(s+'+1.15s' for s in ON.split(';')),
             end=OFF,dur='indefinite')


def switch_visibility(off,on):
    node('set',off,attributeName='display',to='none',begin=ON,end=OFF,dur='indefinite')
    on.set('display','none')
    node('set',on,attributeName='display',to='inline',begin=ON,end=OFF,dur='indefinite')


off=hit_ellipse(hits,'int-guide-on','Turn controller on',1703.6,681.6,133,121,-12.1)
on=hit_ellipse(hits,'int-guide-off','Turn controller off',1703.6,681.6,133,121,-12.1)
switch_visibility(off,on)

# Presentation controls are also paths and shapes inside this same SVG.
ui=node('g',root,id='int-controls')
label(ui,'XBOX 360',-85,-145,72,fill='#344042',tracking=6)
label(ui,'WIRELESS CONTROLLER',-80,-79,34,fill='#778082',tracking=4)
label(ui,'PRESS GUIDE TO SWITCH POWER',2080,-99,35,fill='#5d6769',tracking=1)

def ui_button(ident,name,text,x,w=350):
    g=interactive(ui,ident,name)
    node('rect',g,x=x,y=2810,width=w,height=153,rx=38,fill='#ffffff',fill_opacity='.56',stroke='#aeb5b5',stroke_width=2)
    label(g,text,x+w/2,2906,45,center=True,tracking=.6)
    hilite=node('rect',g,x=x,y=2810,width=w,height=153,rx=38,fill='#93b998',opacity='0',pointer_events='none')
    node('set',hilite,attributeName='opacity',to='.2',begin=ident+'.pointerover;'+ident+'.focusin',
         end=ident+'.pointerout;'+ident+'.focusout',dur='indefinite')
    node('animate',g,attributeName='opacity',values='1;.6;1',begin=action_events([ident]),dur='.22s')
    return g

for ident,name,text,x in [('int-left','Rotate left','ROTATE LEFT',-35),('int-right','Rotate right','ROTATE RIGHT',335),
                         ('int-tilt-button','Tilt controller','TILT',705),('int-turn','Turn controller 360 degrees in plane','TURN 360',1075),
                         ('int-rumble-button','Play visual rumble','RUMBLE',1445),('int-reset','Reset controller','RESET',2545)]:
    ui_button(ident,name,text,x)
off=ui_button('int-ui-on','Power on','POWER ON',1815,710)
on=ui_button('int-ui-off','Power off','POWER OFF',1815,710)
switch_visibility(off,on)
unpowered_rumble=ui_button('int-rumble-unpowered','Power on to enable rumble','RUMBLE',1445)
unpowered_rumble.attrib.update(opacity='.4',cursor='default',tabindex='-1',**{'aria-disabled':'true','pointer-events':'none'})
switch_visibility(unpowered_rumble,get('int-rumble-button'))
status=node('g',ui)
label(status,'POWER OFF',1460,2732,36,fill='#7b8484',center=True,tracking=4)
active=node('g',ui,display='none')
node('rect',active,x=1150,y=2680,width=620,height=70,fill='#e2e4e7')
label(active,'POWER ON',1460,2732,36,fill='#55851f',center=True,tracking=4)
node('set',status,attributeName='display',to='none',begin=ON,end=OFF,dur='indefinite')
node('set',active,attributeName='display',to='inline',begin=ON,end=OFF,dur='indefinite')
label(ui,'PRESS BUTTONS  /  HOLD STICK EDGES  /  HOLD D-PAD EDGES',1460,3048,36,fill='#747e80',center=True,tracking=1.7)
label(ui,'VISUAL ROTATION AND RUMBLE  -  NO AUDIO OR PHYSICAL HAPTICS',1460,3113,29,fill='#899192',center=True,tracking=1)

for ident,angle in [('int-left',-18),('int-right',18),('int-reset',0)]:
    node('animateTransform',orbit,id=ident+'-rotation',attributeName='transform',type='rotate',
         **{'from':f'{angle} 1460 1260'},to=f'{angle} 1460 1260',
         begin=action_events([ident]),dur='.001s',fill='freeze')
node('animateTransform',spin_axis,id='int-spin',attributeName='transform',type='rotate',
     values='0 1460 1260;360 1460 1260',begin=action_events(['int-turn']),
     end=action_events(['int-left','int-right','int-reset']),dur='2.4s',fill='remove',
     calcMode='spline',keyTimes='0;1',keySplines='.4 0 .2 1')
node('animateTransform',spin_fit,id='int-spin-fit-animation',attributeName='transform',type='scale',
     values='1;0.82;0.82;1',keyTimes='0;.15;.85;1',begin=action_events(['int-turn']),
     end=action_events(['int-left','int-right','int-reset']),dur='2.4s',fill='remove')
node('animateTransform',tilt,id='int-tilt-animation',attributeName='transform',type='skewY',
     values='0;-7;0;7;0',keyTimes='0;.24;.5;.76;1',begin=action_events(['int-tilt-button']),end=RESET,dur='2.8s',fill='remove')
node('animateTransform',tilt_scale,id='int-tilt-scaling',attributeName='transform',type='scale',
     values='1 1;.91 .98;1 1;.91 .98;1 1',keyTimes='0;.24;.5;.76;1',
     begin=action_events(['int-tilt-button']),end=RESET,dur='2.8s',fill='remove')

RUMBLE=action_events(['int-rumble-button'])
node('animateTransform',rumble_low,id='int-rumble-low-animation',attributeName='transform',type='translate',
     values='0 0;8 -4;-7 4;6 2;-8 -3;4 3;0 0',begin=RUMBLE,end=OFF,
     dur='.21s',repeatCount='8',fill='remove')
node('animateTransform',rumble_high,id='int-rumble-high-animation',attributeName='transform',type='rotate',
     values='0 1460 1260;.15 1460 1260;-.13 1460 1260;0 1460 1260',begin=RUMBLE,end=OFF,
     dur='.06s',repeatCount='28',fill='remove')
indicator=node('g',ui,opacity='0')
for x in [1420,1440,1460,1480,1500]:
    node('rect',indicator,x=x,y=2978,width=9,height=15,rx=4,fill='#76a945')
node('animate',indicator,attributeName='opacity',values='.3;1;.3',begin=RUMBLE,end=OFF,dur='.14s',repeatCount='12',fill='remove')

# This browser resolves event times reliably with an explicit zero offset.
# A live three-case probe confirmed bare event values failed while +0s fired.
for el in root.iter():
    for attribute in ['begin','end']:
        if attribute in el.attrib:
            el.set(attribute,';'.join(t+'+0s' if re.fullmatch(r'[\w-]+\.[\w]+',t) else t
                                     for t in el.get(attribute).split(';')))

# Refine the real vector materials before auditing the standalone delivery.
refine(root)

# Verify the delivery constraint before writing the standalone SVG.
forbidden={'image','feImage','foreignObject','script','text','audio','video','canvas'}
violations=[]
ids=[]
for el in root.iter():
    tag=el.tag.rsplit('}',1)[-1]
    if tag in forbidden: violations.append(tag)
    if el.get('id'): ids.append(el.get('id'))
    for key,value in el.attrib.items():
        if key.rsplit('}',1)[-1].lower().startswith('on'): violations.append(key)
        if key.rsplit('}',1)[-1]=='href' and not value.startswith('#'): violations.append(value)
        if re.search(r'(?:data:|https?://|javascript:)',value): violations.append(value[:80])
assert not violations, violations
assert len(ids)==len(set(ids)), 'Duplicate IDs'
ET.indent(root,space=' ')
svg=ET.tostring(root,encoding='unicode')+'\n'
(ROOT/'controller.svg').write_text(svg, encoding='utf-8')
report={'svg_bytes':len(svg.encode()),'unique_ids':len(ids),'forbidden_elements':violations,
        'animation_elements':sum(e.tag.rsplit('}',1)[-1] in {'animate','animateTransform','set'} for e in root.iter()),
        'script_elements':0,'external_resources':0,'bitmap_elements':0,
        'limitations':['Front-view 2D rotation and affine tilt, not a 3D reconstruction.',
                       'Rumble is visible motion, not physical haptics.',
                       'No audio. Pure SVG does not synthesize browser sound.',
                       'The existing artwork retains its previously documented realism limits.']}
(ROOT/'build').mkdir(exist_ok=True)
(ROOT/'build/source-checks.json').write_text(json.dumps(report,indent=2)+'\n', encoding='utf-8')
print(json.dumps(report,indent=2))
