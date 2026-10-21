"""Generate docs/img/banner.png (1280x640, also usable as the GitHub social preview)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1280, 640
bg = Image.new("RGB", (W, H), (14, 16, 22))
glow = Image.new("RGB", (W, H), (14, 16, 22))
gd = ImageDraw.Draw(glow)
gd.ellipse([700, -200, 1500, 600], fill=(34, 60, 90))
gd.ellipse([-300, 300, 500, 900], fill=(20, 60, 56))
bg = Image.blend(bg, glow.filter(ImageFilter.GaussianBlur(160)), 0.9)
d = ImageDraw.Draw(bg)
F = "C:/Windows/Fonts/"
def font(name, size): return ImageFont.truetype(F + name, size)

icon = Image.open(os.path.join(ROOT, "build", "icon.png")).convert("RGBA").resize((96, 96), Image.LANCZOS)
bg.paste(icon, (80, 110), icon)
d.text((196, 120), "Speaker Awake", font=font("segoeuib.ttf", 64), fill=(232, 234, 242))
d.text((80, 250), "Stop your speakers from falling asleep.", font=font("segoeuib.ttf", 34), fill=(54, 214, 181))
d.text((80, 300), "Never miss the first ring of a call again.", font=font("segoeui.ttf", 30), fill=(180, 186, 205))
d.text((80, 400), "Windows tray app for Microlab Solo 29 & other", font=font("segoeui.ttf", 22), fill=(141, 147, 170))
d.text((80, 432), "auto-standby speakers  ·  Free & open source", font=font("segoeui.ttf", 22), fill=(141, 147, 170))
d.rounded_rectangle([80, 510, 360, 566], 14, fill=(54, 214, 181))
d.text((220, 538), "Download for Windows", font=font("segoeuib.ttf", 22), fill=(4, 18, 14), anchor="mm")

shot = Image.open(os.path.join(ROOT, "docs", "img", "main-en.png")).convert("RGB")
shot = shot.crop((0, 0, shot.width, 1500))
sw = 380
shot = shot.resize((sw, int(shot.height * sw / shot.width)), Image.LANCZOS)
mask = Image.new("L", shot.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, shot.width - 1, shot.height - 1], 22, fill=255)
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([850, 70, 850 + sw, 70 + shot.height], 22, fill=(0, 0, 0, 160))
bg.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(24)).split()[3])
bg.paste(shot, (850, 70), mask)
bg.save(os.path.join(ROOT, "docs", "img", "banner.png"), optimize=True)
print("ok")
