# Gera "fotografias" ilustradas de produtos artesanais para o sandbox local.
import math, random, sys
from PIL import Image, ImageDraw, ImageFilter
random.seed(7)
OUT = sys.argv[1]
def bg(w, h, c1, c2):
    img = Image.new("RGB", (w, h), c1)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)))
    # mesa
    d.rectangle([0, int(h * .72), w, h], fill=tuple(max(0, v - 28) for v in c2))
    # textura de grão
    px = img.load()
    for _ in range(w * h // 18):
        x, y = random.randrange(w), random.randrange(h)
        r, g, b = px[x, y]; n = random.randint(-9, 9)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return img
def shadow(img, box):
    sh = Image.new("L", img.size, 0); ImageDraw.Draw(sh).ellipse(box, fill=110)
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    dark = Image.new("RGB", img.size, (60, 40, 30)); img.paste(dark, (0, 0), sh)
def vase(img, col, w_ratio=.34):
    w, h = img.size; d = ImageDraw.Draw(img); cx = w // 2; base = int(h * .8)
    shadow(img, [cx - w * .25, base - 20, cx + w * .25, base + 25])
    pts = []
    for i in range(60):
        t = i / 59; y = base - t * h * .6
        r = w * w_ratio * (0.55 + 0.45 * math.sin(math.pi * (0.15 + t * 0.85))) * (0.5 if t > .85 else 1)
        pts.append((cx + r, y))
    poly = pts + [(2 * cx - x, y) for x, y in reversed(pts)]
    d.polygon(poly, fill=col)
    for i in range(5):
        y = base - (i + 1) * h * .1
        d.line([(cx - w * .3, y), (cx + w * .3, y)], fill=tuple(max(0, v - 25) for v in col), width=3)
    hl = Image.new("L", img.size, 0); ImageDraw.Draw(hl).ellipse([cx - w * .2, base - h * .5, cx - w * .1, base - h * .15], fill=60)
    img.paste((255, 255, 255), (0, 0), hl.filter(ImageFilter.GaussianBlur(14)))
def bowl(img, col):
    w, h = img.size; d = ImageDraw.Draw(img); cx = w // 2; base = int(h * .78)
    shadow(img, [cx - w * .35, base - 15, cx + w * .35, base + 25])
    d.chord([cx - w * .36, base - h * .5, cx + w * .36, base + h * .05], 0, 180, fill=col)
    d.ellipse([cx - w * .36, base - h * .26, cx + w * .36, base - h * .14], fill=tuple(max(0, v - 40) for v in col))
    for k in range(7):
        a = k / 7 * math.pi
        d.arc([cx - w * .3, base - h * .4, cx + w * .3, base], 10 + k * 22, 20 + k * 22, fill=(250, 242, 235), width=4)
def crochet(img, col):
    w, h = img.size; d = ImageDraw.Draw(img); cx, cy = w // 2, int(h * .52)
    shadow(img, [cx - w * .38, cy + h * .2, cx + w * .38, cy + h * .3])
    for r in range(int(min(w, h) * .38), 8, -14):
        c = col if (r // 14) % 2 else tuple(min(255, v + 40) for v in col)
        d.ellipse([cx - r, cy - r * .9, cx + r, cy + r * .9], outline=c, width=9)
    for k in range(24):
        a = k / 24 * 2 * math.pi; r = min(w, h) * .38
        d.ellipse([cx + r * math.cos(a) - 9, cy + r * .9 * math.sin(a) - 9, cx + r * math.cos(a) + 9, cy + r * .9 * math.sin(a) + 9], fill=col)
def basket(img, col):
    w, h = img.size; d = ImageDraw.Draw(img); cx = w // 2; base = int(h * .8)
    shadow(img, [cx - w * .32, base - 15, cx + w * .32, base + 25])
    top = base - h * .45
    d.polygon([(cx - w * .32, top), (cx + w * .32, top), (cx + w * .26, base), (cx - w * .26, base)], fill=col)
    for y in range(int(top), base, 14):
        d.line([(cx - w * .31, y), (cx + w * .31, y)], fill=tuple(max(0, v - 35) for v in col), width=4)
    for x in range(int(cx - w * .3), int(cx + w * .3), 22):
        d.line([(x, top), (x + (cx - x) * .18, base)], fill=tuple(min(255, v + 25) for v in col), width=3)
    d.arc([cx - w * .22, top - h * .25, cx + w * .22, top + h * .1], 180, 360, fill=tuple(max(0, v - 35) for v in col), width=10)
def jewelry(img, col):
    w, h = img.size; d = ImageDraw.Draw(img); cx, cy = w // 2, int(h * .45)
    d.arc([cx - w * .3, cy - h * .3, cx + w * .3, cy + h * .25], 20, 160, fill=(120, 90, 60), width=3)
    for k in range(9):
        a = math.radians(25 + k * 16.25); x = cx + w * .3 * math.cos(a); y = cy - h * .025 + h * .275 * math.sin(a)
        r = 16 if k != 4 else 30
        d.ellipse([x - r, y - r, x + r, y + r], fill=col if k % 2 else (250, 242, 235), outline=(90, 60, 40), width=2)
def soap(img, col):
    w, h = img.size; d = ImageDraw.Draw(img)
    for k, (dx, dy) in enumerate([(-.18, .05), (.12, -.02), (0, .16)]):
        x0, y0 = w * (.5 + dx) - w * .17, h * (.55 + dy) - h * .1
        shadow(img, [x0, y0 + h * .16, x0 + w * .34, y0 + h * .24])
        c = tuple(min(255, v + k * 18) for v in col)
        d.rounded_rectangle([x0, y0, x0 + w * .34, y0 + h * .2], radius=26, fill=c)
        d.rounded_rectangle([x0 + 12, y0 + 12, x0 + w * .34 - 12, y0 + h * .2 - 12], radius=20, outline=(255, 255, 255), width=2)
def paper(img, col):
    w, h = img.size; d = ImageDraw.Draw(img); cx, cy = w // 2, int(h * .5)
    shadow(img, [cx - w * .28, cy + h * .25, cx + w * .28, cy + h * .33])
    d.rectangle([cx - w * .25, cy - h * .3, cx + w * .25, cy + h * .28], fill=col)
    d.rectangle([cx - w * .25, cy - h * .3, cx - w * .2, cy + h * .28], fill=tuple(max(0, v - 40) for v in col))
    for y in range(int(cy - h * .22), int(cy + h * .2), 18):
        d.line([(cx - w * .15, y), (cx + w * .2, y)], fill=(250, 242, 235), width=2)
    d.ellipse([cx - w * .06, cy - h * .1, cx + w * .12, cy + h * .08], outline=(250, 242, 235), width=5)
KINDS = {"vase": vase, "bowl": bowl, "crochet": crochet, "basket": basket, "jewelry": jewelry, "soap": soap, "paper": paper}
PAL = [((246, 233, 222), (226, 200, 180)), ((236, 232, 218), (205, 196, 170)), ((243, 226, 214), (214, 180, 160)), ((232, 236, 228), (196, 204, 186))]
specs = [
 ("vaso-terracota", "vase", (178, 107, 79), (900, 1100)), ("vaso-musgo", "vase", (86, 96, 68), (900, 900)),
 ("tigela-esmaltada", "bowl", (75, 110, 120), (1200, 900)), ("tigela-areia", "bowl", (214, 180, 140), (900, 900)),
 ("sousplat-croche", "crochet", (196, 140, 110), (900, 900)), ("tapete-croche", "crochet", (86, 96, 68), (1400, 800)),
 ("cesto-fibra", "basket", (190, 150, 95), (900, 1200)), ("cesto-mini", "basket", (150, 110, 70), (900, 900)),
 ("colar-sementes", "jewelry", (178, 107, 79), (900, 900)), ("colar-ceramica", "jewelry", (86, 96, 68), (900, 1100)),
 ("sabonetes-naturais", "soap", (220, 190, 170), (1100, 900)), ("sabonete-argila", "soap", (190, 160, 150), (900, 900)),
 ("caderno-artesanal", "paper", (120, 80, 60), (900, 1100)), ("agenda-tecido", "paper", (86, 96, 68), (900, 900)),
 ("capa-loja-1", "bowl", (178, 107, 79), (1600, 600)), ("capa-loja-2", "crochet", (196, 140, 110), (1600, 600)),
]
for i, (name, kind, col, size) in enumerate(specs):
    c1, c2 = PAL[i % len(PAL)]
    img = bg(*size, c1, c2); KINDS[kind](img, col)
    img.save(f"{OUT}/{name}.jpg", quality=84, optimize=True, progressive=True)
print(len(specs))
