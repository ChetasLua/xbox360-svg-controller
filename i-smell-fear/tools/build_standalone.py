"""Inline fonts, scripts and the soundtrack into one file: i-smell-fear.html (opens from disk, no server)."""
import base64, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

def b64(path):
    return base64.b64encode(open(os.path.join(ROOT, path), "rb").read()).decode()

html = re.sub(r"url\((fonts/[^)]+\.woff2)\)", lambda m: f"url(data:font/woff2;base64,{b64(m.group(1))})", html)
html = re.sub(r'<script src="(src/[^"]+\.js)"></script>',
              lambda m: "<script>\n" + open(os.path.join(ROOT, m.group(1)), encoding="utf-8").read() + "\n</script>", html)
assert 'src="audio/mix.mp3"' in html
html = html.replace('src="audio/mix.mp3"', f'src="data:audio/mpeg;base64,{b64("audio/mix.mp3")}"')
out = os.path.join(ROOT, "i-smell-fear.html")
open(out, "w", encoding="utf-8").write(html)
print(out, f"{os.path.getsize(out)/1e6:.2f} MB")
