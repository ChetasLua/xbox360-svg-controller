import sys, glob, os
from PIL import Image, ImageDraw
d = sys.argv[1]; out = sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
files = sorted(glob.glob(os.path.join(d, 'f_*.png')))
ims = [Image.open(f).convert('RGB').resize((360, 450)) for f in files]
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 360, rows * 470), 'white')
dr = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * 360, (i // cols) * 470
    sheet.paste(im, (x, y)); dr.text((x + 6, y + 452), os.path.basename(f)[2:-4] + 's', fill='black')
sheet.save(out, quality=88)
print(out, sheet.size)
