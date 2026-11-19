import os
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = "/usr/share/fonts/pickle-hwp"
FONT = os.path.join(FONT_DIR, "NotoSansCJKkr-Regular.otf")
OUT = "/workspace/projects/us-stock-tax-calc/assets"
os.makedirs(OUT, exist_ok=True)

NAVY = (14, 42, 71)
BLUE = (31, 111, 235)
WHITE = (255, 255, 255)
MUTED = (169, 194, 223)


def gradient(size, c1, c2):
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line(
            [(0, y), (w, y)],
            fill=(
                int(c1[0] + (c2[0] - c1[0]) * t),
                int(c1[1] + (c2[1] - c1[1]) * t),
                int(c1[2] + (c2[2] - c1[2]) * t),
            ),
        )
    return img


# ── OG 커버 1200x630 (TaxMoa 허브) ─────────────────────
W, H = 1200, 630
img = gradient((W, H), NAVY, (20, 54, 88))
d = ImageDraw.Draw(img, "RGBA")

for r in (760, 560, 380):
    d.ellipse([W - r + 180, H - r + 90, W + r - 180, H + r - 90], outline=(255, 255, 255, 14), width=2)

# 브랜드 배지
d.rounded_rectangle([80, 60, 148, 128], radius=18, fill=BLUE)
d.text((114, 94), "TM", font=ImageFont.truetype(FONT, 32), fill=WHITE, anchor="mm")
d.text((166, 78), "TaxMoa", font=ImageFont.truetype(FONT, 32), fill=WHITE, stroke_width=1, stroke_fill=WHITE)
d.text((166, 114), "미국주식 세금 계산기 허브", font=ImageFont.truetype(FONT, 19), fill=MUTED)

# 메인 카피
f_main = ImageFont.truetype(FONT, 62)
d.text((80, 178), "미국주식 세금,", font=f_main, fill=WHITE, stroke_width=1, stroke_fill=WHITE)
d.text((80, 252), "네 가지만 알면 됩니다", font=f_main, fill=(140, 190, 255), stroke_width=1, stroke_fill=(140, 190, 255))

f_sub = ImageFont.truetype(FONT, 27)
d.text((82, 352), "양도세 · 배당세 · ISA · 수수료를 한 곳에서 계산합니다", font=f_sub, fill=(205, 222, 240))

# 하단 지표 카드 4개
f_k = ImageFont.truetype(FONT, 34)
f_l = ImageFont.truetype(FONT, 18)
cards = [("22%", "양도세"), ("15.4%", "배당세"), ("9.9%", "ISA 분리과세"), ("0.07%", "수수료 비교")]
x = 80
for big, label in cards:
    d.rounded_rectangle([x, 430, x + 250, 540], radius=16, fill=(255, 255, 255, 18), outline=(255, 255, 255, 45), width=1)
    d.text((x + 22, 448), big, font=f_k, fill=WHITE, stroke_width=1, stroke_fill=WHITE)
    d.text((x + 22, 500), label, font=f_l, fill=MUTED)
    x += 268

img.save(f"{OUT}/og-cover.png", optimize=True)

# ── 애플 터치 아이콘 180x180 ─────────────────────────
size = 180
icon = gradient((size, size), NAVY, (26, 78, 128))
di = ImageDraw.Draw(icon, "RGBA")
di.rounded_rectangle([0, 0, size - 1, size - 1], radius=40, fill=None)
di.text((size / 2, size / 2), "TM", font=ImageFont.truetype(FONT, 60), fill=WHITE, anchor="mm", stroke_width=2, stroke_fill=WHITE)
icon.save(f"{OUT}/apple-touch-icon.png", optimize=True)

print("done", sorted(os.listdir(OUT)))
