import os
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"
OUT = "/workspace/projects/us-stock-tax-calc/assets"
os.makedirs(OUT, exist_ok=True)

NAVY = (14, 42, 71)
NAVY2 = (28, 74, 118)
BLUE = (31, 111, 235)
WHITE = (255, 255, 255)
MUTED = (169, 194, 223)


def gradient(size, c1, c2):
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=(
            int(c1[0] + (c2[0] - c1[0]) * t),
            int(c1[1] + (c2[1] - c1[1]) * t),
            int(c1[2] + (c2[2] - c1[2]) * t),
        ))
    return img


# ── OG 커버 1200x630 ─────────────────────────────────
W, H = 1200, 630
img = gradient((W, H), NAVY, (22, 58, 94))
d = ImageDraw.Draw(img, "RGBA")

for r in (760, 560, 380):
    d.ellipse([W - r + 180, H - r + 90, W + r - 180, H + r - 90], outline=(255, 255, 255, 14), width=2)

# 브랜드 배지
d.rounded_rectangle([80, 64, 148, 132], radius=18, fill=(31, 111, 235))
f_badge = ImageFont.truetype(FONT, 34)
d.text((114, 98), "ST", font=f_badge, fill=WHITE, anchor="mm")
f_brand = ImageFont.truetype(FONT, 30)
d.text((166, 82), "StockTax", font=f_brand, fill=WHITE, stroke_width=1, stroke_fill=WHITE)
d.text((166, 116), "미국주식 양도세 계산기", font=ImageFont.truetype(FONT, 19), fill=MUTED)

# 메인 카피
f_main = ImageFont.truetype(FONT, 66)
d.text((80, 196), "미국주식 양도세", font=f_main, fill=WHITE, stroke_width=1, stroke_fill=WHITE)
d.text((80, 280), "세금 0원 매도 역산", font=f_main, fill=(140, 190, 255), stroke_width=1, stroke_fill=(140, 190, 255))

f_sub = ImageFont.truetype(FONT, 30)
d.text((82, 400), "250만 원 기본공제 · 손익통산 · 22% 실효세율", font=f_sub, fill=(205, 222, 240))

# 하단 지표
f_k = ImageFont.truetype(FONT, 40)
f_l = ImageFont.truetype(FONT, 20)
cards = [("250만원", "기본공제"), ("22%", "양도세+지방세"), ("12/29", "연말 매도 안전선")]
x = 80
for big, label in cards:
    d.rounded_rectangle([x, 470, x + 330, 570], radius=16, fill=(255, 255, 255, 18), outline=(255, 255, 255, 45), width=1)
    d.text((x + 26, 486), big, font=f_k, fill=WHITE, stroke_width=1, stroke_fill=WHITE)
    d.text((x + 26, 534), label, font=f_l, fill=MUTED)
    x += 348

img.save(f"{OUT}/og-cover.png", optimize=True)

# ── 애플 터치 아이콘 180x180 ─────────────────────────
size = 180
icon = gradient((size, size), NAVY, (26, 78, 128))
di = ImageDraw.Draw(icon, "RGBA")
di.rounded_rectangle([0, 0, size - 1, size - 1], radius=40, fill=None)
f_i = ImageFont.truetype(FONT, 66)
di.text((size / 2, size / 2), "ST", font=f_i, fill=WHITE, anchor="mm", stroke_width=2, stroke_fill=WHITE)
icon.save(f"{OUT}/apple-touch-icon.png", optimize=True)

print("done", [f for f in os.listdir(OUT)])
