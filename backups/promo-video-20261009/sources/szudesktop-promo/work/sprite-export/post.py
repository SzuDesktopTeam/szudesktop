"""Post-process the Chrome 1x renders into the promo sprite library.

Run after `node export-sprites.mjs` and `node render-extras.mjs cards`:
  /opt/miniconda3/bin/python3 post.py
Writes HD nearest-neighbour copies, construction build steps, flora, backgrounds
(+ sharp cover crops and opening mosaics), app/tray icons, the pixel cursor, the
324-frame companion wall, and assets/sprites/manifest.json.
Source files are only read (read-only worktree); nothing outside assets/sprites
and work/sprite-export is written.
"""
import json, math, re, shutil, hashlib
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path('/Users/alakazan/workplace/szudesktop-promo-src/desktop')
OUT = Path('/Users/alakazan/workplace/szudesktop-promo/assets/sprites')
WORK = Path('/Users/alakazan/workplace/szudesktop-promo/work/sprite-export')
STORYBOARD = Path('/Users/alakazan/workplace/szudesktop-promo/work/storyboard.md')
J = json.loads((WORK / 'jobs.json').read_text())

FORBIDDEN = re.compile(r'pingu|skipper|turtle|企鹅|小龟|阿青|noot', re.I)
HD_EDGE = 1024
FPS = 60


def rel(p):
    return str(Path(p).relative_to(OUT))


def hd_scale(w, h):
    return max(1, HD_EDGE // max(w, h))


def nn(img, k):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


def norm_hex(f):
    f = f.upper()
    return '#' + ''.join(c * 2 for c in f[1:]) if len(f) == 4 else f[:7]


def verify_pixel_png(path, fills=None):
    a = np.asarray(Image.open(path).convert('RGBA'))
    alpha = set(np.unique(a[..., 3]).tolist())
    ok_alpha = alpha <= {0, 255}
    cols = {'#%02X%02X%02X' % tuple(p) for p in a[a[..., 3] == 255][:, :3]}
    extra = sorted(cols - {norm_hex(f) for f in fills}) if fills is not None else []
    return ok_alpha and not extra, {'alpha_values': sorted(alpha), 'colors': len(cols), 'extra_colors': extra}


def frames_at_fps(durations_ms, fps=FPS):
    """Cumulative rounding so the clip total stays exact at the given fps."""
    out, t, prev = [], 0, 0
    for d in durations_ms:
        t += d
        end = round(t * fps / 1000)
        out.append({'start': prev, 'count': end - prev})
        prev = end
    return out


# ---------------------------------------------------------------- storyboard uses
def storyboard_uses():
    uses, shot = {}, None
    if not STORYBOARD.exists():
        return uses
    for line in STORYBOARD.read_text().splitlines():
        m = re.match(r'^\*\*(S\d\d) ·', line)
        if m:
            shot = m.group(1)
            continue
        if shot and line.startswith('- 素材'):
            for tok in re.split(r'[；、，,。（）()\s：:]+', line):
                tok = tok.strip('`')
                t = re.sub(r'_0-5$', '', tok)
                if re.match(r'^(pet|crop|icon|tile|project|flora|bg|app|tray|cursor|brand)_', t) or t in ('crop_*', 'flora_*'):
                    uses.setdefault(t, []).append(shot)
            continue
        if line.startswith('## 4.'):
            shot = None
    return uses


USES = storyboard_uses()
# The cursor is only named in the shot JSON (S05 drag/scroll, S06 menu click), not in the 素材 lines.
USES.setdefault('cursor_pixel', []).extend(['S05', 'S06'])


def used_in(key):
    shots = set(USES.get(key, []))
    if key.startswith('crop_'):
        shots |= set(USES.get('crop_*', []))
    if key.startswith('flora_'):
        shots |= set(USES.get('flora_*', []))
    if key.startswith('tile_'):
        shots |= set(USES.get('tile_2…tile_2048', [])) if key != 'tile_4096' else set()
    return sorted(shots)


# ---------------------------------------------------------------- vector sprites → hd
sprites = {}
verification = {'checked': 0, 'failed': []}
for job in J['jobs']:
    p1 = OUT / job['png_1x']
    ok, info = verify_pixel_png(p1, job['fills'])
    verification['checked'] += 1
    if not ok:
        verification['failed'].append({job['name']: info})
    img = Image.open(p1).convert('RGBA')
    w, h = img.size
    k = hd_scale(w, h)
    hd_dir = OUT / job['group'] / 'hd'
    hd_dir.mkdir(parents=True, exist_ok=True)
    hd_path = hd_dir / f"{job['name']}.png"
    nn(img, k).save(hd_path, optimize=True)
    job['png_hd'] = rel(hd_path)
    job['hd_scale'] = k
    job['hd_size'] = [w * k, h * k]
    job['colors'] = info['colors']

if verification['failed']:
    raise SystemExit(f"colour/alpha verification failed: {verification['failed'][:5]}")

# Companion animations ------------------------------------------------------
pet_meta = J['pet_meta']
by_name = {j['name']: j for j in J['jobs']}
COMP_ORDER = ['libao', 'cat', 'egret']
OVERVIEW_SCALE = {'libao': 2, 'cat': 5, 'egret': 3}
companions = []
for sid in COMP_ORDER:
    meta = pet_meta[sid]
    w, h = [int(x) for x in meta['viewBox'].split()[2:]]
    k = hd_scale(w, h)
    companions.append({'sprite_id': sid, 'species': meta['species'], 'name': meta['name'], 'native_size': [w, h],
                       'hd_scale': k, 'hd_size': [w * k, h * k], 'signature_label': meta['signature_label'],
                       'pace': {'libao': 1.0, 'cat': 1.16, 'egret': 1.3}[sid], 'overview_scale': OVERVIEW_SCALE[sid]})
    for action in J['pet_actions']:
        a = meta['actions'][action]
        fr60 = frames_at_fps([f['duration_ms'] for f in a['frames']])
        frames = []
        for f, t in zip(a['frames'], fr60):
            job = by_name[f"{a['key']}_{f['index']}"]
            frames.append({'index': f['index'], 'png_1x': job['png_1x'], 'png_hd': job['png_hd'], 'svg': job['svg_file'],
                           'duration_ms': f['duration_ms'], 'start_frame_60fps': t['start'], 'frames_60fps': t['count'],
                           'symbol_id': f['symbol_id']})
        sprites[a['key']] = {
            'type': 'animation', 'group': 'pets', 'key': a['key'], 'storyboard_key': f"{a['key']}_0-5",
            'companion': meta['name'], 'species': meta['species'], 'sprite_id': sid, 'action': action,
            'action_label': a['label'], 'loop': a['loop'], 'total_ms': a['total_ms'],
            'total_frames_60fps': sum(t['count'] for t in fr60),
            'native_size': [w, h], 'hd_scale': k, 'hd_size': [w * k, h * k],
            'frames': frames,
            'source': f"pet-animation-art.mjs animationFrames('{meta['species']}'); timings pet-animation.mjs TIMINGS × pace",
            'used_in': used_in(a['key']),
        }

# Static expressions, items, tiles, projects ---------------------------------
GROUP_TYPE = {'pets_static': 'still', 'items': 'still', 'tiles': 'still', 'projects': 'still'}
for job in J['jobs']:
    if job['group'] == 'pets':
        continue
    w, h = job['size_1x']
    entry = {'type': 'still', 'group': job['group'], 'key': job['key'], 'png_1x': job['png_1x'], 'png_hd': job['png_hd'],
             'svg': job['svg_file'], 'native_size': [w, h], 'hd_scale': job['hd_scale'], 'hd_size': job['hd_size'],
             'colors': job['colors'], 'source': job['source'], 'used_in': used_in(job['key'])}
    if job.get('label'):
        entry['label'] = job['label']
    if job['group'] == 'pets_static':
        entry['overview_scale'] = OVERVIEW_SCALE[job['key'].split('_')[1]]
    if job['group'] == 'tiles':
        entry.update({'value': job['value'], 'kind': job['kind'], 'card': f"tiles/card/tile_card_{job['value']}.png",
                      'card_note': 'arcade.css 棋子样式 ×3（336×336 + 6px 下阴影 = 336×342，透明外沿）；原画 ×7 = 224px；数字 Fusion Pixel 72px（4 位数 60px）'})
        if job['value'] == 4096:
            entry['note'] = '丰收庆典（≥4096），本片分镜不用'
    sprites[job['key']] = entry

sprites['brand_lychee'] = {**sprites['crop_lychee'], 'key': 'brand_lychee', 'alias_of': 'crop_lychee',
                           'source': 'desktop/index.html <symbol id="f-lychee">（顶栏品牌荔枝，与作物荔枝同一张图）',
                           'used_in': used_in('brand_lychee')}

# Project build steps (bottom-up, 2 px rows per step) and row strips -----------
for pid in J['projects']:
    key = f'project_{pid}'
    img = Image.open(OUT / sprites[key]['png_1x']).convert('RGBA')
    w, h = img.size
    k = sprites[key]['hd_scale']
    a = np.asarray(img)
    steps1, stepsh, strips1, stripsh = [], [], [], []
    for d in ('build/1x', 'build/hd', 'strips/1x', 'strips/hd'):
        (OUT / 'projects' / d).mkdir(parents=True, exist_ok=True)
    n = h // 2
    for i in range(1, n + 1):
        b = np.zeros_like(a)
        b[h - 2 * i:] = a[h - 2 * i:]
        im = Image.fromarray(b)
        p1 = OUT / 'projects/build/1x' / f'{key}_build_{i:02d}.png'
        ph = OUT / 'projects/build/hd' / f'{key}_build_{i:02d}.png'
        im.save(p1, optimize=True); nn(im, k).save(ph, optimize=True)
        steps1.append(rel(p1)); stepsh.append(rel(ph))
        s = np.zeros_like(a)
        s[2 * (i - 1):2 * i] = a[2 * (i - 1):2 * i]
        im = Image.fromarray(s)
        p1 = OUT / 'projects/strips/1x' / f'{key}_rows_{2 * (i - 1):02d}-{2 * i - 1:02d}.png'
        ph = OUT / 'projects/strips/hd' / f'{key}_rows_{2 * (i - 1):02d}-{2 * i - 1:02d}.png'
        im.save(p1, optimize=True); nn(im, k).save(ph, optimize=True)
        strips1.append(rel(p1)); stripsh.append(rel(ph))
    nonempty_rows = [int(r) for r in np.where(a[..., 3].any(axis=1))[0]]
    sprites[key].update({
        'build_steps_1x': steps1, 'build_steps_hd': stepsh,
        'build_note': f'自下而上逐步搭建：第 i 张显示底部 2i 行（共 {n} 张，最后一张 = 完整原画）；画布不变，可直接叠放替换。'
                      f'原画非空行 {nonempty_rows[0]}–{nonempty_rows[-1]}，空行对应的步骤画面不变。',
        'row_strips_1x': strips1, 'row_strips_hd': stripsh,
        'row_strips_note': '每片只含 2 行像素、画布与原画一致（位置已对齐），可逐片飞入拼合。',
    })

# Flora --------------------------------------------------------------------
for name in ('tallgrass', 'berrybush'):
    srcp = SRC / 'assets/garden/flora' / f'{name}.png'
    img = Image.open(srcp).convert('RGBA')
    k = hd_scale(*img.size)
    for d in ('1x', 'hd'):
        (OUT / 'flora' / d).mkdir(parents=True, exist_ok=True)
    p1 = OUT / 'flora/1x' / f'flora_{name}.png'
    ph = OUT / 'flora/hd' / f'flora_{name}.png'
    img.save(p1, optimize=True); nn(img, k).save(ph, optimize=True)
    ok, info = verify_pixel_png(p1)
    sprites[f'flora_{name}'] = {'type': 'still', 'group': 'flora', 'key': f'flora_{name}', 'png_1x': rel(p1), 'png_hd': rel(ph),
                                'native_size': list(img.size), 'hd_scale': k, 'hd_size': [img.width * k, img.height * k],
                                'alpha_values': info['alpha_values'], 'colors': info['colors'],
                                'source': f'desktop/assets/garden/flora/{name}.png（原图拷贝）', 'used_in': used_in(f'flora_{name}')}

# Backgrounds ---------------------------------------------------------------
BG = OUT / 'bg'
(BG / 'mosaic').mkdir(parents=True, exist_ok=True)


def sharp_cover(img, W, H, cx=0.5, cy=0.5):
    """Pixel-art friendly non-integer scale: NN to an integer multiple, then area-downsample."""
    s = max(W / img.width, H / img.height)
    n = max(1, math.ceil(s))
    big = nn(img, n)
    sw, sh = round(img.width * s), round(img.height * s)
    scaled = big.resize((sw, sh), Image.BOX)
    x = min(max(0, round(sw * cx - W / 2)), sw - W)
    y = min(max(0, round(sh * cy - H / 2)), sh - H)
    return scaled.crop((x, y, x + W, y + H)), {'scale': round(s, 5), 'crop_xy': [x, y], 'center': [cx, cy]}


def mosaic(img, block):
    a = np.asarray(img.convert('RGB')).astype(np.float64)
    H, W = a.shape[:2]
    # grid anchored on the frame centre so partial blocks are symmetric
    ox = (W / 2) % block
    oy = (H / 2) % block
    xs = [0] + [int(round(ox + i * block)) for i in range(int((W - ox) // block) + 1) if 0 < ox + i * block < W] + [W]
    ys = [0] + [int(round(oy + i * block)) for i in range(int((H - oy) // block) + 1) if 0 < oy + i * block < H] + [H]
    xs, ys = sorted(set(xs)), sorted(set(ys))
    out = np.empty_like(a)
    for y0, y1 in zip(ys[:-1], ys[1:]):
        for x0, x1 in zip(xs[:-1], xs[1:]):
            out[y0:y1, x0:x1] = a[y0:y1, x0:x1].reshape(-1, 3).mean(0)
    return Image.fromarray(np.round(out).astype(np.uint8))


MOSAIC_BLOCKS = [96, 64, 48, 32, 24, 16, 12, 8]
for name, vcx in (('campus', 0.45), ('courtyard', 0.5)):
    srcp = SRC / 'assets/garden' / f'{name}.png'
    orig = BG / f'bg_{name}.png'
    shutil.copyfile(srcp, orig)
    img = Image.open(srcp).convert('RGB')
    entry = {'type': 'background', 'group': 'bg', 'key': f'bg_{name}', 'png': rel(orig), 'native_size': list(img.size),
             'source': f'desktop/assets/garden/{name}.png（原图逐字节拷贝，索引色 PNG）', 'cover': {}, 'cover_info': {},
             'used_in': used_in(f'bg_{name}')}
    for W, H, cx in ((1920, 1080, 0.5), (3840, 2160, 0.5), (1080, 1920, vcx)):
        im, info = sharp_cover(img, W, H, cx=cx)
        p = BG / f'bg_{name}_{W}x{H}.png'
        im.save(p, optimize=True)
        entry['cover'][f'{W}x{H}'] = rel(p)
        entry['cover_info'][f'{W}x{H}'] = info
    if name == 'campus':
        entry['mosaic'] = {}
        for size in ('1920x1080', '1080x1920'):
            base = Image.open(BG / f'bg_campus_{size}.png')
            lst = []
            for b in MOSAIC_BLOCKS:
                p = BG / 'mosaic' / f'bg_campus_{size}_m{b:03d}.png'
                mosaic(base, b).save(p, optimize=True)
                lst.append({'block': b, 'png': rel(p)})
            entry['mosaic'][size] = lst
        entry['mosaic_note'] = ('开场马赛克：以对应 cover 图为底、按输出像素 b×b 取块均值，网格以画面中心对齐（边缘块对称）。'
                                'S01：96 → 拍 1 32 → 拍 2 8 → 原图；像素块溶解可按 8→16→32→64 反向使用。')
    entry['cover_note'] = ('cover 图 = 原图最近邻放大到整数倍后按面积缩到目标尺寸再居中裁切（非整数倍缩放下像素边仍锐利、宽度均匀）；'
                           '竖版 campus 裁切中心 x=0.45（湖面 + 台阶上的两位同学）。')
    sprites[f'bg_{name}'] = entry

# App icon & tray icon -------------------------------------------------------
APP = OUT / 'app'
APP.mkdir(exist_ok=True)
icon = Image.open(SRC / 'assets/szudesktop.icns').convert('RGBA')  # Pillow opens the largest size (512@2x)
assert icon.size == (1024, 1024), icon.size
icon.save(APP / 'app_icon_1024.png', optimize=True)
icon.resize((512, 512), Image.LANCZOS).save(APP / 'app_icon_512.png', optimize=True)
icon.resize((256, 256), Image.LANCZOS).save(APP / 'app_icon_256.png', optimize=True)
sprites['app_icon_1024'] = {'type': 'still', 'group': 'app', 'key': 'app_icon_1024', 'png': 'app/app_icon_1024.png',
                            'png_512': 'app/app_icon_512.png', 'png_256': 'app/app_icon_256.png', 'native_size': [1024, 1024],
                            'source': 'desktop/assets/szudesktop.icns 最大尺寸（512@2x）', 'note': '圆角暖纸底 + 像素荔枝，边缘本身带抗锯齿，缩放用平滑插值即可',
                            'used_in': used_in('app_icon_1024')}
tray = Image.open(SRC / 'assets/szudesktop-trayTemplate@2x.png').convert('RGBA')
tray16 = Image.open(SRC / 'assets/szudesktop-trayTemplate.png').convert('RGBA')
for d in ('1x', 'hd'):
    (APP / d).mkdir(exist_ok=True)
tray.save(APP / '1x/tray_icon_template_32.png', optimize=True)
tray16.save(APP / '1x/tray_icon_template_16.png', optimize=True)
paper = np.asarray(tray).copy()
paper[..., :3] = (0xFF, 0xF9, 0xE9)
paper = Image.fromarray(paper)
paper.save(APP / '1x/tray_icon_paper_32.png', optimize=True)
kt = hd_scale(*tray.size)
nn(tray, kt).save(APP / 'hd/tray_icon_template_32.png', optimize=True)
nn(paper, kt).save(APP / 'hd/tray_icon_paper_32.png', optimize=True)
_, tinfo = verify_pixel_png(APP / '1x/tray_icon_template_32.png')
sprites['tray_icon'] = {'type': 'still', 'group': 'app', 'key': 'tray_icon', 'png_template_1x': 'app/1x/tray_icon_template_32.png',
                        'png_template_16': 'app/1x/tray_icon_template_16.png', 'png_paper_1x': 'app/1x/tray_icon_paper_32.png',
                        'png_template_hd': 'app/hd/tray_icon_template_32.png', 'png_paper_hd': 'app/hd/tray_icon_paper_32.png',
                        'native_size': list(tray.size), 'hd_scale': kt, 'alpha_values': tinfo['alpha_values'],
                        'source': 'desktop/assets/szudesktop-trayTemplate@2x.png（黑色模板图）；paper 版 = 同一 alpha、RGB 改为暖纸 #FFF9E9',
                        'used_in': used_in('tray_icon')}

# Pixel cursor (the only non-app drawing; operation indicator only) ----------
CURSOR = [
    'B...........',
    'BB..........',
    'BWB.........',
    'BWWB........',
    'BWWWB.......',
    'BWWWWB......',
    'BWWWWWB.....',
    'BWWWWWWB....',
    'BWWWWWWWB...',
    'BWWWWWWWWB..',
    'BWWWWWWWWWB.',
    'BWWWWWWBBBBB',
    'BWWWBWWB....',
    'BWWBBWWB....',
    'BWB..BWWB...',
    'BB...BWWB...',
    'B.....BWWB..',
    '......BWWB..',
    '.......BB...',
]
INK, PAPER_C, GOLD = (0x3F, 0x38, 0x29, 255), (0xFF, 0xF9, 0xE9, 255), (0xFF, 0xD3, 0x6F, 255)
assert all(len(r) == 12 for r in CURSOR) and len(CURSOR) == 19
(OUT / 'cursor/1x').mkdir(parents=True, exist_ok=True)
(OUT / 'cursor/hd').mkdir(parents=True, exist_ok=True)
cur_files = {'1x': {}, 'hd': {}}
for state, fill in (('normal', PAPER_C), ('pressed', GOLD)):
    a = np.zeros((19, 12, 4), np.uint8)
    for y, row in enumerate(CURSOR):
        for x, c in enumerate(row):
            if c == 'B':
                a[y, x] = INK
            elif c == 'W':
                a[y, x] = fill
    im = Image.fromarray(a)
    p1 = OUT / 'cursor/1x' / f'cursor_pixel_{state}.png'
    ph = OUT / 'cursor/hd' / f'cursor_pixel_{state}.png'
    im.save(p1, optimize=True)
    nn(im, hd_scale(12, 19)).save(ph, optimize=True)
    cur_files['1x'][state] = rel(p1)
    cur_files['hd'][state] = rel(ph)
sprites['cursor_pixel'] = {'type': 'still', 'group': 'cursor', 'key': 'cursor_pixel', 'png_1x': cur_files['1x'], 'png_hd': cur_files['hd'],
                           'native_size': [12, 19], 'hd_scale': hd_scale(12, 19), 'hotspot': [0, 0],
                           'source': '自绘 12×19 像素箭头（唯一非应用素材，只作操作指示）；墨 #3F3829 描边，常态暖纸 #FFF9E9 填充，按下金 #FFD36F 填充',
                           'used_in': used_in('cursor_pixel')}

# Companion action wall (324 frames) -------------------------------------------
CELL = 120
WALL_SCALE = {'libao': 2, 'cat': 5, 'egret': 3}
ACTIONS = J['pet_actions']
# signature sits on row 9 so the S28 pull-back can start from a cell near the wall centre.
WALL_ROWS = [a for a in ACTIONS if a != 'signature']
WALL_ROWS.insert(9, 'signature')
(OUT / 'wall').mkdir(exist_ok=True)
cells = []
frames_cache = {}


def frame_img(sid, action, i):
    k = (sid, action, i)
    if k not in frames_cache:
        frames_cache[k] = nn(Image.open(OUT / 'pets/1x' / f'pet_{sid}_{action}_{i}.png').convert('RGBA'), WALL_SCALE[sid])
    return frames_cache[k]


for r, action in enumerate(WALL_ROWS):
    for c in range(18):
        sid = COMP_ORDER[c % 3]
        w, h = (int(v) * WALL_SCALE[sid] for v in pet_meta[sid]['viewBox'].split()[2:])
        x0, y0 = c * CELL, r * CELL
        sx, sy = x0 + (CELL - w) // 2, y0 + CELL - 6 - h
        cells.append({'row': r, 'col': c, 'sprite_id': sid, 'companion': pet_meta[sid]['name'], 'action': action,
                      'frame_at_phase0': c // 3, 'cell_rect': [x0, y0, CELL, CELL], 'sprite_rect': [sx, sy, w, h],
                      'sprite_scale': WALL_SCALE[sid], 'bg': '#F3E7CD' if (r + c) % 2 == 0 else '#EADCC1'})
phases = []
for k in range(6):
    wall = Image.new('RGBA', (18 * CELL, 18 * CELL))
    a = np.asarray(wall).copy()
    for cell in cells:
        x0, y0, _, _ = cell['cell_rect']
        a[y0:y0 + CELL, x0:x0 + CELL] = tuple(int(cell['bg'][i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    wall = Image.fromarray(a)
    for cell in cells:
        fi = (cell['frame_at_phase0'] + k) % 6
        im = frame_img(cell['sprite_id'], cell['action'], fi)
        wall.alpha_composite(im, tuple(cell['sprite_rect'][:2]))
    p = OUT / 'wall' / f'pet_wall_324_phase{k}.png'
    wall.convert('RGB').save(p, optimize=True)
    phases.append(rel(p))
seen = {(c['sprite_id'], c['action'], c['frame_at_phase0']) for c in cells}
assert len(seen) == 324
(OUT / 'wall' / 'pet_wall_324_cells.json').write_text(json.dumps({'cell': CELL, 'size': [18 * CELL, 18 * CELL], 'cells': cells}, ensure_ascii=False, indent=1))
libao_sig = next(c for c in cells if c['row'] == 9 and c['col'] == 9)
assert libao_sig['sprite_id'] == 'libao' and libao_sig['action'] == 'signature'
libao_sig['frame_by_phase'] = [(libao_sig['frame_at_phase0'] + k) % 6 for k in range(6)]
sprites['pet_wall_324'] = {
    'type': 'atlas', 'group': 'wall', 'key': 'pet_wall_324', 'phases': phases, 'cells_json': 'wall/pet_wall_324_cells.json',
    'size': [18 * CELL, 18 * CELL], 'cell': CELL, 'grid': [18, 18],
    'row_actions': WALL_ROWS,
    'layout': '行 = 18 个动作（PET_ACTIONS 顺序，signature 移到第 9 行居中：' + ' '.join(WALL_ROWS) + '）；列 c 的伙伴 = [荔宝, 栗栗, 小白][c % 3]，起始帧 = c // 3。'
              'phase k 中每格显示 (起始帧 + k) % 6，所以 phase0–5 依次切换 = 每格循环播放自己的动作；phase0 恰好包含全部 324 帧各一次。',
    'scales': {'libao': 2, 'cat': 5, 'egret': 3}, 'background': '#F3E7CD / #EADCC1 棋盘格，无文字',
    'pullback_anchor': {'description': 'S28 后拉起点：靠近墙面中心的荔宝 signature 格（墙中心 1080,1080；该格中心 1140,1140）。'
                                       'frame_by_phase[k] = phase k 时这格显示的 signature 帧号，全屏特写用 pets/hd 同一帧即可无缝衔接',
                        **{k: libao_sig[k] for k in ('row', 'col', 'cell_rect', 'sprite_rect', 'sprite_scale', 'frame_by_phase')}},
    'source': '由 pets/1x 的 324 帧最近邻放大拼成', 'used_in': used_in('pet_wall_324'),
}

# ---------------------------------------------------------------- manifest
files = [p for p in OUT.rglob('*') if p.is_file() and p.name not in ('manifest.json', 'overview.png')]
for p in files:
    if FORBIDDEN.search(str(p.relative_to(OUT))):
        raise SystemExit(f'forbidden name in output: {p}')
for p in OUT.rglob('*.svg'):
    if FORBIDDEN.search(p.read_text()):
        raise SystemExit(f'forbidden content in {p}')
total_bytes = sum(p.stat().st_size for p in files)

manifest = {
    'title': 'szuDesktop · 荔枝庭院 宣传片像素素材',
    'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    'root': str(OUT),
    'paths_relative_to': 'manifest.json 所在目录（assets/sprites/）',
    'source': {'worktree': str(SRC.parent), 'commit': '4b25817（origin/main，beta0.9.7 内容）',
               'modules': ['desktop/assets/garden/pet-animation-art.mjs', 'pet-animation.mjs', 'pet-catalog.mjs', 'pet-art.mjs',
                           'arcade-art.mjs', 'garden-items.mjs', 'garden-loop-ui.mjs', 'garden-loop.mjs', 'desktop/index.html <symbol>',
                           'desktop/assets/garden/flora/*.png', 'campus.png', 'courtyard.png', 'desktop/assets/szudesktop.icns',
                           'szudesktop-trayTemplate*.png'],
               'tooling': 'work/sprite-export/（export-sprites.mjs → render-extras.mjs cards → post.py → render-extras.mjs overview）'},
    'conventions': {
        '1x': '原生像素网格（viewBox 原尺寸），headless Chrome 软件光栅（--disable-gpu）按源码的 shape-rendering=crispEdges 渲染，透明底；'
              '已逐张校验 alpha 只有 0/255、颜色全部来自源 SVG 的 fill（无抗锯齿杂色）。',
        'hd': '1x 的最近邻整数倍放大，倍数 = floor(1024 / 最长边)：荔宝 ×18（936×1008）、栗栗 ×46（920×1012）、小白 ×32（1024×1024）、'
              '16px 图标 ×64、32px 棋子 ×32、48×28 建设 ×21。',
        'svg': '独立 SVG（含所需 <defs>），仅作源稿留档。不要把 SVG 放大渲染：伙伴的斜向多边形边缘会变成矢量斜线，与像素画不一致（实测最多 2.3% 像素不同）。',
        'remotion': '用 <Img src={staticFile(...)} style={{imageRendering:"pixelated"}}>。整数倍放大优先用 1x × 整数倍（与 hd 逐像素一致）；'
                    '需要非整数倍或 3D 变换时用 hd 再缩小。public/ 下可建软链接 sprites → ../../assets/sprites。',
        'animation_timing': 'duration_ms 来自 pet-animation.mjs TIMINGS × 伙伴节奏（荔宝 1.0 / 栗栗 1.16 / 小白 1.3）；'
                            'start_frame_60fps / frames_60fps 为 60fps 下累计取整后的帧位置。上屏按拍重定时时保持帧序 0→5。'
                            'loop=false 的手势动作播完停在第 5 帧，再回 idle。',
        'anchor': '同一伙伴所有帧画布一致（不裁边），直接叠放即对齐；脚底在画布底部附近。',
    },
    'excluded': {
        'companions': 'Pingu、Skipper、阿青（turtle）未导出：不调用其绘制函数、不解析其 symbol，输出文件名与 SVG 内容已扫描确认不含 pingu/skipper/turtle/企鹅/小龟/阿青/Noot。',
        'symbols': {s: '在 index.html 中定义但当前界面未引用，未导出（避免被当作现有作物或装饰）' for s in J['skipped_symbols']},
    },
    'verification': {'vector_sprites_checked': verification['checked'], 'failed': 0,
                     'nn_vs_vector_max_diff': '2.3%（小白 signature 斜向翅膀）；其余 ≤1.1%'},
    'stats': {'files': len(files) + 2, 'bytes': total_bytes},
    'companions': companions,
    'pet_actions': ACTIONS,
    'storyboard_key_aliases': {'pet_{sprite}_{action}_0-5': 'sprites["pet_{sprite}_{action}"].frames[0..5]',
                               'tile_2…tile_2048': 'sprites["tile_2"] … sprites["tile_2048"]',
                               'crop_*': 'crop_radish / crop_strawberry / crop_blueberry / crop_lychee',
                               'flora_*': 'flora_tallgrass / flora_berrybush'},
    'overview': 'overview.png',
    'sprites': dict(sorted(sprites.items())),
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
print('sprites:', len(sprites), 'files:', len(files), 'MB:', round(total_bytes / 1e6, 1))
missing = sorted(k for k in USES if k not in sprites and not k.endswith('*') and '…' not in k)
print('storyboard keys without sprite entry:', missing)
