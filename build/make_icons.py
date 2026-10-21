"""Generate build/icon.ico (multi-size), build/icon.png and build/tray.png from logo B4 (dark).

The tiny sizes (<= 32 px) drop the crossed-out z, which is unreadable there.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import make_logo_b as B

HERE = os.path.dirname(os.path.abspath(__file__))
S = B.S


def render(size, with_z):
    img = B.L.base((24, 28, 42), (10, 12, 18), 90)
    # without the z the speaker can be larger and is still centred
    B.paste_mask(img, B.glyph_mask(with_z=with_z, fit=0.62 if with_z else 0.70),
                 B.L.grad(B.TEAL, B.BLUE, 45).convert("RGBA"))
    return img.resize((size, size), Image.LANCZOS)


full = render(512, True)
full.save(os.path.join(HERE, "icon.png"))
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [render(n, n > 32) for n in sizes]
frames[-1].save(os.path.join(HERE, "icon.ico"), sizes=[(n, n) for n in sizes],
                append_images=[f for f in frames[:-1]])
render(32, False).save(os.path.join(HERE, "tray.png"))
print("icons written")
