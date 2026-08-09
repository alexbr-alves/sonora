from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ANDROID_RES = ROOT / "apps/mobile/android/app/src/main/res"
MACOS_ASSETS = ROOT / "apps/macos/assets"
PURPLE_HUE = 255 / 360


def recolor_blue_to_sonora(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = []
    for red, green, blue, alpha in rgba.getdata():
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if alpha and 0.48 <= hue <= 0.72 and saturation >= 0.035:
            red_f, green_f, blue_f = colorsys.hsv_to_rgb(PURPLE_HUE, saturation, value)
            red, green, blue = round(red_f * 255), round(green_f * 255), round(blue_f * 255)
        pixels.append((red, green, blue, alpha))
    rgba.putdata(pixels)
    return rgba


def main() -> None:
    launcher_files = sorted(ANDROID_RES.glob("mipmap-*/ic_launcher*.png"))
    if not launcher_files:
        raise SystemExit("Nenhum ícone Android encontrado")

    for path in launcher_files:
        recolor_blue_to_sonora(Image.open(path)).save(path, optimize=True)

    source = ANDROID_RES / "mipmap-xxxhdpi/ic_launcher.png"
    MACOS_ASSETS.mkdir(parents=True, exist_ok=True)
    liquid_glass = MACOS_ASSETS / "icon-liquid-glass.png"
    if liquid_glass.exists():
        mac_icon = Image.open(liquid_glass).convert("RGBA").resize((1024, 1024), Image.Resampling.LANCZOS)
    else:
        mac_icon = Image.open(source).convert("RGBA").resize((1024, 1024), Image.Resampling.LANCZOS)
        scale = 4
        mask = Image.new("L", (1024 * scale, 1024 * scale), 0)
        draw = ImageDraw.Draw(mask)
        inset = 72 * scale
        draw.rounded_rectangle(
            (inset, inset, 1024 * scale - inset, 1024 * scale - inset),
            radius=225 * scale,
            fill=255,
        )
        mask = mask.resize((1024, 1024), Image.Resampling.LANCZOS)
        mac_icon.putalpha(ImageChops.multiply(mac_icon.getchannel("A"), mask))
    mac_icon.save(MACOS_ASSETS / "icon.png", optimize=True)

    mac_icon.save(MACOS_ASSETS / "icon.icns", format="ICNS")


if __name__ == "__main__":
    main()
