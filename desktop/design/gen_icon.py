"""生成 Windows 应用图标 szudesktop.ico；加 --mac 时改为生成 macOS 的应用图标和菜单栏图标。

画什么：一颗像素荔枝（深大的"荔"），跟页面里的荔宝同一套视觉语言。
为什么要自己画而不是拿现成的：
  星露谷素材包里没有荔枝，而且那批图是插画风、不是像素画，做出来的图标
  跟应用本身不是一个语言。这里跟头像一样用点阵字符串画。

ICO 里塞几个尺寸：16/32/48/64/128/256。
Windows 会按显示场景自己挑（任务栏用 32，桌面大图标用 256）。
**16 和 32 必须单独画**——直接把 256 缩下来，眼睛和纹路会糊成一片，
所以这两个尺寸用简化版点阵（去掉小噪点，加粗轮廓）。

用法: python gen_icon.py            # 生成 desktop/assets/szudesktop.ico
      python gen_icon.py --mac      # 只在 macOS 上运行：生成 szudesktop.icns 和两张菜单栏模板图，不碰 .ico

macOS 素材为什么另画：
  - 应用图标自带圆角方形底板，按 Apple 的 1024 网格（底板 824、四周各留 100）。
    图标不是这个形状时，macOS 26 会把它装进一块灰色底板里，跟别的应用放在一起很突兀。
  - 菜单栏图标用黑色加透明度的模板图（文件名以 Template 结尾），系统按深浅色菜单栏自动着色；
    nativeImage 在 macOS 上也解不了 .ico。
  - 荔枝点阵一律按整数倍放大（NEAREST），像素边缘才是齐的；只有底板的圆角做抗锯齿。
"""
import io
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

# ---------------------------------------------------------------- 调色板
PAL = {
    ".": None,
    "o": "#2A1A0C",     # 描边
    "r": "#D24A3C",     # 果壳亮部
    "R": "#A83029",     # 果壳底色
    "q": "#7A1F1A",     # 果壳暗部
    "g": "#5EA83C",     # 叶子亮部
    "G": "#3E7A26",     # 叶子底色
    "w": "#F0A0A8",     # 高光
}

# 16x16：小尺寸用的简化版。轮廓加粗、去掉细节，远看还是颗荔枝。
SMALL = [
    "......ooo.......",
    ".....oGGo.......",
    "....ogggo.......",
    "..oooGGGo.......",
    ".oRRRooRo.......",
    "oRRRRRRRo.......",
    "oRwRRRRRo.......",
    "oRwRRRRRo.......",
    "oRRRRRRRo.......",
    ".oRRRRRo........",
    "..oRRRo.........",
    "...ooo..........",
    "................",
    "................",
    "................",
    "................",
]

# 32x32：中等尺寸，能放下龟裂纹理
MID = [
    "............oooo................",
    "..........ooGGGGo...............",
    ".........oggggGGo...............",
    "........ogggooGGGo..............",
    ".....oooogGo..oGGGo.............",
    "...ooRRRRooo...oGGo.............",
    "..oRRRRRRRRRooo.oGo.............",
    "..oRRRRRRRRRRRRooo..............",
    ".oRRRwRRRRRRRRRRRo..............",
    ".oRRwRRRRRRRRRRRRo..............",
    ".oRRRqqRRRRRqqRRRRo.............",
    ".oRRRRqRRRRRqRRRRRo.............",
    "..oRRRRRRRRRRRRRRRo.............",
    "..oRRRqqRRRRRqqRRRo.............",
    "...oRRqRRRRRqRRRRo..............",
    "...oRRRRRRRRRRRRRo..............",
    "....oRRRqqRRRqqRRo..............",
    "....oRRqRRRRqRRRo...............",
    ".....oRRRRRRRRRo................",
    ".....oRRqqRRRRo.................",
    "......oRqRRRRo..................",
    "......oRRRRRo...................",
    ".......oRRRo....................",
    ".......oRRo.....................",
    "........oo......................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
]


def render(rows, size):
    """点阵 -> PIL Image（正方形，缩放到 size）

    行宽不齐时**右侧补透明**而不是报错：图标这种东西是拿眼睛调的，
    写的时候顺手多按少按一两个点很正常，不该因此编不出图标。
    （但会在下面打印一次提醒，避免真的写错还蒙在鼓里。）
    """
    h = len(rows)
    w = max(len(r) for r in rows)
    ragged = [i for i, r in enumerate(rows) if len(r) != w]
    if ragged:
        print("   注意: 第 %s 行宽度不是 %d，已按右侧补透明处理"
              % (", ".join(map(str, ragged[:6])), w))
    rows = [r.ljust(w, ".") for r in rows]

    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            col = PAL.get(ch)
            if col is None:
                continue
            px[x, y] = (int(col[1:3], 16), int(col[3:5], 16), int(col[5:7], 16), 255)
    # 点阵本身留了边距，裁掉再缩放，图标才占得满
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    # 保持正方
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return sq.resize((size, size), Image.NEAREST)


def main(out):
    # 16/32 用专门画的小图；48 以上用 MID 放大（像素画放大不糊）
    imgs = [
        render(SMALL, 16),
        render(SMALL, 32),
        render(MID, 48),
        render(MID, 64),
        render(MID, 128),
        render(MID, 256),
    ]
    write_ico(out, imgs)
    print("->", out, os.path.getsize(out), "字节",
          "尺寸:", [i.size for i in imgs])


# ---------------------------------------------------------------- ICO 容器
# 为什么不直接用 Pillow 的 save(format="ICO", sizes=..., append_images=...):
#   Pillow 12 起那个多尺寸写法不认 append_images 了，只会存下第一张
#   （实测只剩 16x16）。ICO 格式本身很简单，自己拼更省心，也不用赌版本行为。
#
# ICO = 6 字节头 + N*16 字节目录 + N 张 PNG 数据（Vista 起可以直接内嵌 PNG）
def write_ico(path, imgs):
    import struct
    count = len(imgs)
    header = struct.pack("<HHH", 0, 1, count)   # reserved, type=1(icon), count
    entries, blobs = b"", b""
    offset = 6 + 16 * count
    for im in imgs:
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        data = buf.getvalue()
        # 宽高字段是 1 字节，256 要写成 0（这是 ICO 格式的历史包袱）
        w = 0 if im.width >= 256 else im.width
        h = 0 if im.height >= 256 else im.height
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        blobs += data
        offset += len(data)
    with open(path, "wb") as f:
        f.write(header + entries + blobs)


# ---------------------------------------------------------------- macOS 素材
# 底板：上浅下深的暖米色，和页面的奶油底色一个调子；描一圈浅棕边，放在白色 Finder 背景上也分得清边界。
PLATE_TOP = (255, 250, 240)
PLATE_BOTTOM = (243, 222, 196)
PLATE_EDGE = (222, 196, 160)
# icns 里的 10 张图：(文件名, 像素边长)。同一边长的图内容相同。
ICONSET = [
    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
]


def art_side(rows):
    """点阵裁掉留白、补成正方形后的边长；render 的输出按它的整数倍放大，像素才不会糊。"""
    points = [(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if PAL.get(ch)]
    xs, ys = [x for x, _ in points], [y for _, y in points]
    return max(max(xs) - min(xs), max(ys) - min(ys)) + 1


def mac_art(plate):
    """选点阵和整数倍数：荔枝约占底板的 72%，放不下时用小图。
    大图（MID）只要整数倍放大后和目标差不到 15% 就用它，细节多；否则用小图（SMALL），16/32/64 都走这条。"""
    target = plate * 0.72
    choices = []
    for rows in (MID, SMALL):
        side = art_side(rows)
        k = max(1, round(target / side))
        if side * k <= plate - 2:  # 四周至少留 1 像素底板
            choices.append((rows, side * k))
    rows, size = choices[0]
    if rows is MID and abs(size - target) > target * 0.15 and len(choices) > 1:
        rows, size = choices[1]
    return render(rows, size)


def mac_icon(size):
    """一张带底板的应用图标。底板在 4 倍画布上画再缩小，圆角才平滑。"""
    inset = size * 100 // 1024
    plate = size - 2 * inset
    s = 4
    big, box = size * s, [inset * s, inset * s, (size - inset) * s - 1, (size - inset) * s - 1]
    radius = round(plate * s * 0.2237)  # Apple 网格：824 的底板配 185 左右的圆角
    grad = Image.linear_gradient("L").resize((big, big))
    fill = Image.composite(Image.new("RGBA", (big, big), PLATE_BOTTOM + (255,)),
                           Image.new("RGBA", (big, big), PLATE_TOP + (255,)), grad)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    canvas.paste(fill, (0, 0), mask)
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, outline=PLATE_EDGE + (255,),
                                             width=max(s, round(plate * s * 0.008)))
    icon = canvas.resize((size, size), Image.LANCZOS)
    art = mac_art(plate)
    at = inset + (plate - art.width) // 2
    icon.alpha_composite(art, (at, at))
    return icon


# 菜单栏模板图只涂描边、叶子和龟裂纹，果肉留空：线稿和系统菜单栏图标是一个风格，
# 整颗涂黑则只剩一团看不出是什么的剪影。
TRAY_INK = "ogGq"


def tray_template(rows, size):
    """菜单栏模板图：TRAY_INK 里的像素纯黑不透明，其余全透明，点阵原大居中。"""
    rows = ["".join(ch if ch in TRAY_INK else "." for ch in r) for r in rows]
    art = render(rows, art_side(rows))
    px = art.load()
    for y in range(art.height):
        for x in range(art.width):
            px[x, y] = (0, 0, 0, 255) if px[x, y][3] else (0, 0, 0, 0)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    im.paste(art, ((size - art.width) // 2, (size - art.height) // 2))
    return im


def main_mac(assets):
    if sys.platform != "darwin" or not shutil.which("iconutil"):
        raise SystemExit("--mac 要在装有 Xcode Command Line Tools 的 macOS 上运行（用系统的 iconutil 打包 icns）")
    # 16px 用小点阵原大；@2x（32px）用中号点阵原大，Retina 菜单栏上能看出荔枝壳的龟裂纹。
    trays = [("szudesktop-trayTemplate.png", tray_template(SMALL, 16)),
             ("szudesktop-trayTemplate@2x.png", tray_template(MID, 32))]
    for name, im in trays:
        out = os.path.join(assets, name)
        im.save(out, format="PNG")
        print("->", out, os.path.getsize(out), "字节", "尺寸:", im.size)
    icons = {size: mac_icon(size) for size in sorted({size for _, size in ICONSET})}
    out = os.path.join(assets, "szudesktop.icns")
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, "szudesktop.iconset")
        os.mkdir(iconset)
        for name, size in ICONSET:
            icons[size].save(os.path.join(iconset, name), format="PNG")
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)
    print("->", out, os.path.getsize(out), "字节", "尺寸:", sorted(icons))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    if "--mac" in sys.argv[1:]:
        main_mac(os.path.join(here, "..", "assets"))
    else:
        main(os.path.join(here, "..", "assets", "szudesktop.ico"))
