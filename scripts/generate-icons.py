"""Regenerate the checked-in icons with Pillow and Noto Color Emoji.

Normal builds use the checked-in PNG/ICO assets and do not need Python/fonts.
The weight-lifter glyph is rendered from the SIL Open Font License Noto font.
"""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
font = ImageFont.truetype(FONT, 109)  # Noto's embedded bitmap strike
emoji = Image.new('RGBA', (180, 160))
ImageDraw.Draw(emoji).text((10, 0), '🏋️', font=font, embedded_color=True)
emoji = emoji.crop(emoji.getbbox())


def icon(size):
    # Match the app's handheld shell and sage screen. iOS supplies the outer
    # home-screen corner mask, so keep the PNG opaque all the way to its edges.
    scale = 4
    canvas = Image.new('RGB', (size * scale, size * scale), '#d8d6cb')
    draw = ImageDraw.Draw(canvas)
    def px(n):
        return round(n * size * scale / 180)
    draw.rounded_rectangle((px(9), px(9), px(171), px(171)), radius=px(32),
                           fill='#d6dca9', outline='#53634d', width=max(1, px(3)))
    glyph_size = px(130)
    glyph = emoji.resize((glyph_size, glyph_size), Image.Resampling.LANCZOS)
    offset = (size * scale - glyph_size) // 2
    canvas.paste(glyph, (offset, offset), glyph)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)

icon(180).save(ROOT / 'public/apple-touch-icon.png', optimize=True)
icon(32).save(ROOT / 'public/favicon-32.png', optimize=True)
icon(48).save(ROOT / 'public/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
print('Generated opaque 180px Apple touch icon, 32px favicon, and multi-size ICO.')
