"""Generate build/icon.ico (multi-size) and build/tray.png with Pillow."""
from PIL import Image, ImageDraw
import os

HERE = os.path.dirname(os.path.abspath(__file__))

def draw(size):
    s = size * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(s * 0.22)
    # rounded gradient square
    grad = Image.new("RGBA", (s, s))
    gp = grad.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * s)
            gp[x, y] = (int(54 + (108 - 54) * t), int(214 + (140 - 214) * t), int(181 + (255 - 181) * t), 255)
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], r, fill=255)
    img.paste(grad, (0, 0), mask)
    # speaker glyph (dark)
    c = (10, 20, 24, 255)
    u = s / 100
    d.polygon([(22*u, 40*u), (36*u, 40*u), (54*u, 24*u), (54*u, 76*u), (36*u, 60*u), (22*u, 60*u)], fill=c)
    for i, rad in enumerate((14, 26)):
        box = [54*u - rad*u*0.2 + 0*u, 50*u - rad*u, 54*u + rad*u*1.6, 50*u + rad*u]
        d.arc(box, -45, 45, fill=c, width=int(5*u))
    return img.resize((size, size), Image.LANCZOS)

sizes = [16, 24, 32, 48, 64, 128, 256]
draw(256).save(os.path.join(HERE, "icon.ico"), sizes=[(n, n) for n in sizes])
draw(32).save(os.path.join(HERE, "tray.png"))
draw(512).save(os.path.join(HERE, "icon.png"))
print("icons written")
