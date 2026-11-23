#!/usr/bin/env python3
"""Write the launch images iOS shows while the home-screen app starts.

    python3 scripts/generate-launch-images.py      # icons/launch/*.png
    python3 scripts/generate-launch-images.py --tags  # print index.html's <link>s

A home-screen web app opens on a blank white page until its first paint; an
apple-touch-startup-image whose size matches the device exactly is shown
instead. Following Apple's launch-screen guidance (look like the first
screen, no splash), each image is just raume's ground colour -- --group-ground,
light and dark -- so the app appears to open straight onto itself.

Requires Pillow (dev-time only -- not part of the site).
"""
import os
import sys
from PIL import Image

OUT = "icons/launch"
LIGHT = (242, 243, 247)  # --group-ground #f2f3f7 (the grouped ground every screen sits on)
DARK = (22, 24, 28)      # --group-ground in dark = --page-bg #16181c

# (CSS width, CSS height, pixel ratio) in portrait -- current iPhones and iPads.
DEVICES = [
    (440, 956, 3),   # iPhone 16 Pro Max / 17 Pro Max
    (402, 874, 3),   # iPhone 16 Pro / 17 Pro / 17
    (420, 912, 3),   # iPhone Air
    (430, 932, 3),   # iPhone 16 Plus / 15 Plus / 15 Pro Max / 14 Pro Max
    (393, 852, 3),   # iPhone 16 / 15 / 15 Pro / 14 Pro / 16e-era
    (390, 844, 3),   # iPhone 14 / 13 / 13 Pro / 12 / 12 Pro
    (428, 926, 3),   # iPhone 14 Plus / 13 Pro Max / 12 Pro Max
    (375, 812, 3),   # iPhone 13 mini / 12 mini / 11 Pro / XS
    (414, 896, 3),   # iPhone 11 Pro Max / XS Max
    (414, 896, 2),   # iPhone 11 / XR
    (375, 667, 2),   # iPhone SE / 8
    (1032, 1376, 2), # iPad Pro 13"
    (1024, 1366, 2), # iPad Pro 12.9" / iPad Air 13"
    (834, 1210, 2),  # iPad Pro 11" (M4)
    (834, 1194, 2),  # iPad Pro 11" / iPad Air 11"
    (820, 1180, 2),  # iPad Air / iPad 10th gen
    (810, 1080, 2),  # iPad 9th gen
    (744, 1133, 2),  # iPad mini
]


def name(w, h, r, dark):
    return "%s/launch-%dx%d%s.png" % (OUT, w * r, h * r, "-dark" if dark else "")


def tags():
    out = []
    for w, h, r in DEVICES:
        for dark in (False, True):
            media = "(device-width: %dpx) and (device-height: %dpx) and (-webkit-device-pixel-ratio: %d) and (orientation: portrait) and (prefers-color-scheme: %s)" % (
                w, h, r, "dark" if dark else "light")
            out.append('<link rel="apple-touch-startup-image" media="%s" href="%s">' % (media, name(w, h, r, dark)))
    return "\n".join(out)


def main():
    if "--tags" in sys.argv:
        print(tags())
        return
    os.makedirs(OUT, exist_ok=True)
    for w, h, r in DEVICES:
        for dark in (False, True):
            # A one-entry palette (no dithering): a flat image compresses to a
            # few KB.
            im = Image.new("P", (w * r, h * r), 0)
            im.putpalette(list(DARK if dark else LIGHT))
            im.save(name(w, h, r, dark), optimize=True)
    print("wrote %d launch images to %s/" % (len(DEVICES) * 2, OUT))


if __name__ == "__main__":
    main()
