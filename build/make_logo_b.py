"""Refined variants of logo B (speaker + crossed-out z). Pillow only."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
import make_logo_options as L

S = L.S
OUT = os.path.join(L.ROOT, "docs", "logo-options", "b")
os.makedirs(OUT, exist_ok=True)

TEAL, BLUE = (46, 214, 180), (84, 118, 255)
NAVY = (16, 22, 44)


def rounded(poly, radius):
    """Round every corner of a polygon: blur the mask and re-threshold."""
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(radius))
    return m.point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.GaussianBlur(1.2))


def arc_mask(cx, cy, radii, width, span=40):
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    for r in radii:
        L.cap_arc(d, [cx - r, cy - r, cx + r, cy + r], -span, span, width, 255)
    return m


def paste_mask(img, mask, fill):
    layer = Image.new("RGBA", (S, S), fill) if isinstance(fill, tuple) else fill
    img.paste(layer, (0, 0), mask)


def speaker_mask(ox, oy, sc, radius=9):
    pts = [(-200, -92), (-96, -92), (30, -205), (30, 205), (-96, 92), (-200, 92)]
    return rounded([(ox + x * sc, oy + y * sc) for x, y in pts], radius)


def line_mask(a, b, w):
    m = Image.new("L", (S, S), 0)
    L.cap_line(ImageDraw.Draw(m), a, b, w, 255)
    return m


def z_mask(x0, y0, s, w):
    """A crossed-out z: the slash cuts a clean gap through the letter."""
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    pts = [(x0, y0), (x0 + s, y0), (x0, y0 + s), (x0 + s, y0 + s)]
    for a, b in zip(pts, pts[1:]):
        L.cap_line(d, a, b, w, 255)
    a, b = (x0 - s * 0.12, y0 - s * 0.1), (x0 + s * 1.12, y0 + s * 1.1)
    gap = line_mask(a, b, int(w * 1.45))
    slash = line_mask(a, b, int(w * 0.5))
    return ImageChops.lighter(ImageChops.subtract(m, gap), slash)


def glyph_mask(with_z=True, fit=0.62):
    """Glyph centred on the tile by its bounding box, scaled so its width is `fit` of the tile."""
    m = speaker_mask(318, 600, 1.0)
    m = ImageChops.lighter(m, arc_mask(410, 600, (120, 212), 40, 38))
    if with_z:
        m = ImageChops.lighter(m, z_mask(648, 170, 190, 36))
    x0, y0, x1, y1 = m.getbbox()
    crop = m.crop((x0, y0, x1, y1))
    k = S * fit / (x1 - x0)
    crop = crop.resize((round((x1 - x0) * k), round((y1 - y0) * k)), Image.LANCZOS)
    out = Image.new("L", (S, S), 0)
    out.paste(crop, ((S - crop.width) // 2, (S - crop.height) // 2))
    return out


def b1():
    """White glyph on the brand gradient."""
    img = L.base(TEAL, BLUE, 45)
    paste_mask(img, glyph_mask(), (255, 255, 255, 255))
    return img


def b3():
    """Pale tile with a gradient glyph. Reads on dark and light taskbars."""
    img = L.base((247, 249, 255), (226, 232, 248), 90)
    paste_mask(img, glyph_mask(), L.grad(TEAL, BLUE, 45).convert("RGBA"))
    return img


def b4():
    """Dark tile with a gradient glyph."""
    img = L.base((24, 28, 42), (10, 12, 18), 90)
    paste_mask(img, glyph_mask(), L.grad(TEAL, BLUE, 45).convert("RGBA"))
    return img


VARIANTS = [("B1", "Gradient", b1), ("B3", "Light", b3), ("B4", "Dark", b4)]

if __name__ == "__main__":
    tiles = []
    for key, name, fn in VARIANTS:
        im = fn().resize((512, 512), Image.LANCZOS)
        im.save(os.path.join(OUT, f"logo-{key}.png"))
        tiles.append((key, name, im))
    pad, label = 40, 70
    W = len(tiles) * 512 + (len(tiles) + 1) * pad
    H = 512 + label + 2 * pad + 60
    sheet = Image.new("RGB", (W, H), (18, 20, 28))
    sd = ImageDraw.Draw(sheet)
    fb = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 40)
    fs = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 30)
    for i, (key, name, im) in enumerate(tiles):
        x = pad + i * (512 + pad)
        sheet.paste(im, (x, pad), im)
        sd.text((x, pad + 522), key, font=fb, fill=(54, 214, 181))
        sd.text((x + 70, pad + 528), name, font=fs, fill=(232, 234, 242))
        for j, px in enumerate((16, 32, 48)):
            sm = im.resize((px, px), Image.LANCZOS)
            sheet.paste(sm, (x + 300 + j * 70, pad + 520 + (48 - px) // 2), sm)
    sheet.save(os.path.join(OUT, "contact-sheet.png"))
    print("done")
