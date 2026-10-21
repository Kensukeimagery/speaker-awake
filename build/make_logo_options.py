"""Draw several logo concepts to docs/logo-options/ plus a contact sheet. Pillow only."""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "logo-options")
os.makedirs(OUT, exist_ok=True)
S = 1024  # working size, downsampled to 512


def grad(c1, c2, angle=45):
    """Diagonal linear gradient image S x S."""
    g = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(g)
    a = math.radians(angle)
    dx, dy = math.cos(a), math.sin(a)
    lo = min(0, S * dx) + min(0, S * dy)
    hi = max(0, S * dx) + max(0, S * dy)
    for y in range(S):
        for x in range(0, S, 1):
            pass
    # row-wise using 1px lines along the perpendicular is simpler: draw per-step polygons
    steps = 512
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        col = tuple(int(c1[k] + (c2[k] - c1[k]) * (t0 + t1) / 2) for k in range(3))
        # band between projections lo + t*(hi-lo)
        p0 = lo + (hi - lo) * t0
        p1 = lo + (hi - lo) * t1
        # points where x*dx + y*dy = p ; draw as wide polygon covering canvas
        def line(p):
            # a point on the line and a direction along it
            cx, cy = dx * p, dy * p
            return (cx - dy * 3000, cy + dx * 3000), (cx + dy * 3000, cy - dx * 3000)
        (a0, a1), (b0, b1) = line(p0), line(p1)
        d.polygon([a0, a1, b1, b0], fill=col)
    return g


def squircle_mask(r=0.225):
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], int(S * r), fill=255)
    return m


def base(c1, c2, angle=45):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(grad(c1, c2, angle), (0, 0), squircle_mask())
    return img


def cap_line(d, p0, p1, w, fill):
    d.line([p0, p1], fill=fill, width=w)
    for p in (p0, p1):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=fill)


def cap_arc(d, box, a0, a1, w, fill):
    d.arc(box, a0, a1, fill=fill, width=w)
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    r = (box[2] - box[0]) / 2 - w / 2
    for a in (a0, a1):
        x, y = cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fill)


def speaker_glyph(d, ox, oy, sc, fill):
    """Classic speaker body, centred about (ox, oy), scale sc (1 = 400px wide)."""
    u = sc
    pts = [(-200, -90), (-110, -90), (20, -200), (20, 200), (-110, 90), (-200, 90)]
    d.polygon([(ox + x * u, oy + y * u) for x, y in pts], fill=fill)


# ---------- A: power ring (matches the in-app button) ----------
def logo_a():
    img = base((18, 22, 34), (10, 12, 18), 90)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx = cy = S // 2
    for r, w, a in ((410, 10, 60), (350, 10, 110)):
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(54, 214, 181, a), width=w)
    teal = (54, 214, 181, 255)
    cap_arc(gd, [cx - 250, cy - 250, cx + 250, cy + 250], -60, 240, 54, teal)
    cap_line(gd, (cx, cy - 290), (cx, cy - 20), 54, teal)
    halo = glow.filter(ImageFilter.GaussianBlur(26))
    img = Image.alpha_composite(img, halo)
    img = Image.alpha_composite(img, glow)
    m = squircle_mask()
    img.putalpha(Image.composite(img.getchannel("A"), Image.new("L", (S, S), 0), m))
    return img


# ---------- B: speaker, Zzz crossed out ----------
def logo_b():
    img = base((54, 214, 181), (86, 120, 255), 45)
    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    speaker_glyph(d, 360, 560, 1.15, white)
    for i, r in enumerate((130, 230)):
        cap_arc(d, [330 - r * 0.2, 560 - r * 1.25, 330 + r * 1.9, 560 + r * 1.25][:4] if False else
                [470 - r, 560 - r, 470 + r, 560 + r], -42, 42, 38, white)
    # crossed-out "z"
    def z(x, y, s, w):
        pts = [(x, y), (x + s, y), (x, y + s), (x + s, y + s)]
        for a, b in zip(pts, pts[1:]):
            cap_line(d, a, b, w, (255, 255, 255, 235))
    z(690, 170, 110, 26)
    z(780, 90, 70, 20)
    cap_line(d, (660, 130), (850, 330), 30, (14, 20, 34, 255))
    return img


# ---------- C: driver as an open eye ----------
def logo_c():
    img = base((20, 24, 38), (9, 11, 17), 90)
    d = ImageDraw.Draw(img)
    cx, cy = S // 2, S // 2
    w, h = 400, 235
    top = [(cx + w * t, cy - h * (1 - t * t)) for t in [i / 40 * 2 - 1 for i in range(41)]]
    bot = [(cx + w * t, cy + h * (1 - t * t)) for t in [i / 40 * 2 - 1 for i in range(41)][::-1]]
    d.polygon(top + bot, fill=(240, 244, 255, 255))
    # iris = speaker driver
    ir = 215
    iris = grad((54, 214, 181), (86, 120, 255), 45).crop((0, 0, 2 * ir, 2 * ir))
    mask = Image.new("L", (2 * ir, 2 * ir), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 2 * ir - 1, 2 * ir - 1], fill=255)
    img.paste(iris, (cx - ir, cy - ir), mask)
    for r, wd in ((165, 12), (118, 12)):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(10, 16, 26, 110), width=wd)
    d.ellipse([cx - 62, cy - 62, cx + 62, cy + 62], fill=(10, 16, 26, 255))
    d.ellipse([cx - 14 + 24, cy - 14 - 28, cx + 14 + 24, cy + 14 - 28], fill=(255, 255, 255, 230))
    # lashes / lid line
    d.line(top, fill=(54, 214, 181, 255), width=22, joint="curve")
    return img


# ---------- D: heartbeat pulse ----------
def logo_d():
    img = base((255, 138, 76), (232, 62, 140), 40)
    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    pts = [(140, 540), (340, 540), (410, 440), (480, 640), (560, 250), (650, 790), (720, 540), (884, 540)]
    for a, b in zip(pts, pts[1:]):
        cap_line(d, a, b, 52, white)
    # tiny speaker dot cluster = "always listening" dots
    for i, x in enumerate((300, 512, 724)):
        d.ellipse([x - 16, 880 - 16, x + 16, 880 + 16], fill=(255, 255, 255, 150 if i != 1 else 255))
    return img


# ---------- E: speaker + notification ----------
def logo_e():
    img = base((120, 92, 255), (54, 160, 255), 60)
    d = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    speaker_glyph(d, 360, 540, 1.2, white)
    for r in (150, 260):
        cap_arc(d, [490 - r, 540 - r, 490 + r, 540 + r], -45, 45, 40, white)
    # ringing bell dot
    d.ellipse([700, 140, 880, 320], fill=(255, 214, 80, 255), outline=(30, 20, 90, 255), width=0)
    d.ellipse([748, 188, 832, 272], fill=(30, 20, 90, 255))
    return img


# ---------- F: sunrise over a tweeter dome ----------
def logo_f():
    img = base((14, 20, 44), (30, 60, 110), 90)
    d = ImageDraw.Draw(img)
    cx, horizon = S // 2, 640
    gold = (255, 205, 90, 255)
    teal = (54, 214, 181, 255)
    # rays
    for ang in range(-150, -29, 20):
        a = math.radians(ang)
        p0 = (cx + 330 * math.cos(a), horizon + 330 * math.sin(a))
        p1 = (cx + 450 * math.cos(a), horizon + 450 * math.sin(a))
        cap_line(d, p0, p1, 34, gold if ang % 40 == 10 or True else teal)
    # dome
    r = 270
    d.pieslice([cx - r, horizon - r, cx + r, horizon + r], 180, 360, fill=teal)
    r2 = 170
    d.pieslice([cx - r2, horizon - r2, cx + r2, horizon + r2], 180, 360, fill=(30, 200, 170, 255))
    r3 = 70
    d.pieslice([cx - r3, horizon - r3, cx + r3, horizon + r3], 180, 360, fill=(14, 20, 44, 255))
    # ground line
    cap_line(d, (170, horizon + 40), (854, horizon + 40), 34, (232, 238, 255, 255))
    return img


LOGOS = [
    ("A", "Power ring", logo_a),
    ("B", "Speaker, no zzz", logo_b),
    ("C", "Speaker eye", logo_c),
    ("D", "Heartbeat", logo_d),
    ("E", "Call alert", logo_e),
    ("F", "Sunrise dome", logo_f),
]

if __name__ == "__main__":
    tiles = []
    for key, name, fn in LOGOS:
        im = fn().resize((512, 512), Image.LANCZOS)
        im.save(os.path.join(OUT, f"logo-{key}.png"))
        tiles.append((key, name, im))
    cols, pad, label = 3, 40, 70
    W = cols * 512 + (cols + 1) * pad
    rows = math.ceil(len(tiles) / cols)
    H = rows * (512 + label) + (rows + 1) * pad
    sheet = Image.new("RGB", (W, H), (18, 20, 28))
    sd = ImageDraw.Draw(sheet)
    fb = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 40)
    fs = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 30)
    for i, (key, name, im) in enumerate(tiles):
        x = pad + (i % cols) * (512 + pad)
        y = pad + (i // cols) * (512 + label + pad)
        sheet.paste(im, (x, y), im)
        sd.text((x, y + 522), key, font=fb, fill=(54, 214, 181))
        sd.text((x + 50, y + 528), name, font=fs, fill=(232, 234, 242))
        # small-size preview (32px) to judge legibility in the tray
        sm = im.resize((32, 32), Image.LANCZOS)
        sheet.paste(sm, (x + 512 - 32, y + 524), sm)
    sheet.save(os.path.join(OUT, "contact-sheet.png"))
    print("done")
