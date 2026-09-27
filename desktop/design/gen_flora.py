"""自己画页面装饰用的像素花草（素材源里没有植物，只能画）。

为什么用点阵字符串：
  改形状只要改字符，一眼能看懂；比用代码画矩形好维护得多。

约定：
  ·  透明
  0-9a-f  调色板索引

⚠️ 每个点阵的**每行宽度必须完全一致**，不然形状会歪。
add() 里有 assert 校验，宽了窄了当场报错，不会悄悄画歪。

只保留页面实际引用的两种（desktop/assets/garden/app.mjs）：
  berrybush  庭院小屋装备「窗边小花」时的装饰
  tallgrass  农田里尚未开垦的地块
早先画过的其他花草动物页面从未使用，已随图片一起删掉，需要时可从 Git 历史找回。
新增素材时先在页面里接上引用，再把它加到这里。

用法: python gen_flora.py [输出目录]
"""
import os
import sys

from PIL import Image

# 默认写到页面真正读取的目录（desktop/assets/garden/flora）。
# 只覆盖这里定义的文件，不清空目录。
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "garden", "flora")


def p(x):
    """把点阵行里的中文点换成 ASCII 点，方便对着编辑器看。"""
    return x.replace("·", ".")


# 每个物件：pal 调色板 + px 点阵
SPRITES = {}


def add(name, pal, *rows):
    rows = [p(r) for r in rows]
    w = len(rows[0])
    for i, r in enumerate(rows):
        assert len(r) == w, "'%s' 第 %d 行宽度 %d，应该是 %d: %r" % (name, i, len(r), w, r)
    SPRITES[name] = {"pal": pal, "px": rows}


add("tallgrass",  # 高草丛
    {"1": "#5FAE4A", "2": "#4C9838", "3": "#3E7C2C", "4": "#2F5E20"},
    "···1··1·",
    "·1·1··1·",
    "·1·1·1·1",
    "11121111",
    "·1211221",
    "·2222222",
    "··33223·",
    "···333··",
)

add("berrybush",  # 灌木：绿丛 + 4 颗亮蓝莓
    {"1": "#2F5E20", "2": "#3E7C2C", "3": "#4C9838", "4": "#63C164",
     "5": "#7EC8F5", "6": "#4A9BD4"},
    "··2233··",
    "·233333·",
    "23353332",
    "23363332",
    "·233333·",
    "··1111··",
)


def render(spec):
    rows = spec["px"]
    h = len(rows)
    w = len(rows[0])
    pal = spec["pal"]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            hexc = pal.get(ch)
            if not hexc:
                raise SystemExit("调色板里没有 '%s'（在 %r 这行）" % (ch, row))
            img.putpixel((x, y), (int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16), 255))
    return img


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    for name in SPRITES:
        img = render(SPRITES[name])
        img.save(os.path.join(outdir, name + ".png"))
        print("  %-12s %2dx%-2d" % (name, img.width, img.height))
    print("共 %d 个花草素材 -> %s" % (len(SPRITES), outdir))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
