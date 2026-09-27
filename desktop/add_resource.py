"""给编好的 Windows exe 塞进图标和版本信息（纯 Python，不装任何工具）。

为什么不走常规路子：
  Go 自己**不支持**往 Windows exe 里加资源，社区做法是装
  `goversioninfo` + `windres`（或 `rsrc`）。但这台机器上没有 windres，
  而装它意味着给项目加一个构建期依赖 —— 这个项目当初就是冲着
  "克隆下来 go build 就能出三端" 设计的，加依赖不合适。
所以这里直接改 PE 文件：解析段表 → 追加一个 .rsrc 段 → 挂到
可选头的资源目录项上。改动量小、可逆、零依赖。

做的事：
  1. 读 exe，校验 PE 结构
  2. 构造资源目录：图标组(14) + 图标(3) + 版本信息(16)
  3. 追加一个 .rsrc 段装这些数据，修正 section 数、SizeOfImage、
     NumberOfRvaAndSizes 和 data directory[2]
  4. 校验：重新解析一遍，确认资源目录和版本块都能按规范读回来

用法:
    python add_resource.py <exe路径> [--ico 图标路径] [--version 0.2.0]

注意：处理过的 exe 用 `go build` 重新编译会覆盖掉，所以这一步必须跟在
编译之后（build-windows.py 里已经接上了）。
"""
import os
import re
import struct
import sys

# GitHub Windows Runner 可能使用 CP1252；中文构建日志统一输出为 UTF-8。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# Windows 资源类型编号
RT_ICON = 3
RT_GROUP_ICON = 14
RT_VERSION = 16


# ---------------------------------------------------------------- PE 读写
class PE:
    def __init__(self, data):
        self.d = bytearray(data)
        if self.d[:2] != b"MZ":
            raise ValueError("不是 PE 文件（没有 MZ 头）")
        self.pe_off = struct.unpack_from("<I", self.d, 0x3C)[0]
        if self.d[self.pe_off:self.pe_off + 4] != b"PE\x00\x00":
            raise ValueError("PE 签名不对")
        self.nsec = struct.unpack_from("<H", self.d, self.pe_off + 6)[0]
        self.opt_size = struct.unpack_from("<H", self.d, self.pe_off + 20)[0]
        self.opt_off = self.pe_off + 24
        magic = struct.unpack_from("<H", self.d, self.opt_off)[0]
        if magic != 0x20B:
            raise ValueError("只支持 PE32+（64 位），拿到 %#x" % magic)
        self.sec_off = self.opt_off + self.opt_size

    def sections(self):
        out = []
        for i in range(self.nsec):
            e = self.sec_off + i * 40
            name = self.d[e:e + 8].rstrip(b"\x00").decode("latin1")
            vsize, vaddr, rawsize, rawptr = struct.unpack_from("<IIII", self.d, e + 8)
            chars = struct.unpack_from("<I", self.d, e + 36)[0]
            out.append(dict(idx=i, off=e, name=name, vsize=vsize, vaddr=vaddr,
                            rawsize=rawsize, rawptr=rawptr, chars=chars))
        return out

    def data_dirs(self):
        n = struct.unpack_from("<I", self.d, self.opt_off + 108)[0]
        base = self.opt_off + 112
        return n, base

    def align_up(self, v, a):
        return (v + a - 1) // a * a

    def section_align(self):
        return struct.unpack_from("<I", self.d, self.opt_off + 32)[0]

    def file_align(self):
        return struct.unpack_from("<I", self.d, self.opt_off + 36)[0]


# ---------------------------------------------------------------- 资源构造
def make_res_dir(entries):
    """entries: [(type_id, name_id, data_bytes), ...]

    返回 (资源段字节, 各数据块在段内的偏移, 数据项表偏移)。第 i 个数据项对应
    entries[i]，数据项里的 RVA 由调用方按 offsets[i] 回填。

    资源目录是三层树：类型 → 名字 → 语言。Windows 在每层目录里按 ID **二分查找**，
    所以同一层的 ID 必须唯一并且升序。以前每条资源各占一个根项，根目录成了
    [14, 3, 3, 3, …, 16]：类型重复、顺序也乱，系统一个都找不到
    （GetFileVersionInfoSize 报 ERROR_RESOURCE_TYPE_NOT_FOUND，ExtractIconEx 返回 0）；
    语言项又直接指向数据块本身而不是数据项，就算找到了也会把数据头当成 RVA。
    所以 exe 属性里一片空白，资源管理器也一直显示默认图标。

    布局（全部相对资源段起点）：
      根目录       16 + 8 × 类型数
      类型目录     每类 16 + 8 × 该类名字数
      语言目录     每条资源 16 + 8（只有 0x409 一项）
      数据项表     每条资源 16（RVA、Size、CodePage、Reserved）
      数据块       各自补齐到 4 字节
    """
    by_type = {}
    for i, (tid, nid, _) in enumerate(entries):
        by_type.setdefault(tid, []).append((nid, i))
    type_ids = sorted(by_type)
    for tid in type_ids:
        by_type[tid].sort()
        names = [nid for nid, _ in by_type[tid]]
        assert len(names) == len(set(names)), ("同一类型下名字 ID 重复", tid, names)

    def dir_size(n):
        return 16 + 8 * n

    off = dir_size(len(type_ids))
    type_dir_off = {}
    for tid in type_ids:
        type_dir_off[tid] = off
        off += dir_size(len(by_type[tid]))
    lang_dir_off = {}
    for tid in type_ids:
        for _, i in by_type[tid]:
            lang_dir_off[i] = off
            off += dir_size(1)
    data_tbl_off = off
    # 数据区从 4 字节对齐处开始
    DATA_OFF = (data_tbl_off + 16 * len(entries) + 3) // 4 * 4

    # ⚠️ IMAGE_RESOURCE_DIRECTORY 是 **16** 字节：
    #     Characteristics(4) + TimeDateStamp(4) + MajorVersion(2) + MinorVersion(2)
    #     + NumberOfNamedEntries(2) + NumberOfIdEntries(2)
    # 少写 4 字节的话，整个树会错位 4 —— 外部看就是"资源目录里全是垃圾 ID"。
    def directory(n):
        return struct.pack("<IIHHHH", 0, 0, 0, 0, 0, n)

    head = bytearray(directory(len(type_ids)))
    # 根项：类型 ID → 该类型的子目录（高位 1 表示"是目录"）
    for tid in type_ids:
        head += struct.pack("<II", tid, 0x80000000 | type_dir_off[tid])
    # 类型目录：名字 ID → 语言子目录
    for tid in type_ids:
        assert len(head) == type_dir_off[tid], ("类型目录错位", tid, len(head))
        head += directory(len(by_type[tid]))
        for nid, i in by_type[tid]:
            head += struct.pack("<II", nid, 0x80000000 | lang_dir_off[i])
    # 语言目录：0x409 → 数据项（高位 0 表示"是叶子"，指向的是数据项，不是数据块）
    for tid in type_ids:
        for _, i in by_type[tid]:
            assert len(head) == lang_dir_off[i], ("语言目录错位", i, len(head))
            head += directory(1)
            head += struct.pack("<II", 0x409, data_tbl_off + 16 * i)
    # 数据项表必须用组装后的实际长度核对：以前按公式推的偏移和真实位置差一截，
    # 回填 RVA 时写错位置，表现为图标 RVA 变成 ASCII "\x89PNG"。
    assert len(head) == data_tbl_off, (len(head), data_tbl_off)
    offsets = []
    blobs = bytearray()
    for _, _, payload in entries:
        # 数据项：RVA(占位，外面回填) + Size + CodePage + Reserved
        head += struct.pack("<IIII", 0, len(payload), 0, 0)
        offsets.append(DATA_OFF + len(blobs))
        blobs += payload
        while len(blobs) % 4:
            blobs += b"\x00"
    assert DATA_OFF >= len(head), ("目录算小了", DATA_OFF, len(head))
    head += b"\x00" * (DATA_OFF - len(head))
    head += blobs
    return bytes(head), offsets, data_tbl_off


def bmp_and_icon(ico_path):
    """拆开 .ico，返回 [(原始PNG/BMP数据, 宽, 高, 位深), ...] 和图标组数据。

    ICO 里嵌的如果是 PNG（Vista 之后都这样），资源里可以直接原样放。
    """
    d = open(ico_path, "rb").read()
    reserved, itype, count = struct.unpack_from("<HHH", d, 0)
    assert reserved == 0 and itype == 1, "不是 ICO"
    items = []
    for i in range(count):
        w, h, colors, res, planes, bpp, size, off = struct.unpack_from("<BBBBHHII", d, 6 + i * 16)
        items.append(dict(w=w or 256, h=h or 256, bpp=bpp or 32,
                          data=d[off:off + size]))
    # 图标组（GRPICONDIR）：头 + 每项 14 字节
    grp = struct.pack("<HHH", 0, 1, len(items))
    for i, it in enumerate(items):
        w = 0 if it["w"] >= 256 else it["w"]
        h = 0 if it["h"] >= 256 else it["h"]
        grp += struct.pack("<BBBBHHIH", w, h, 0, 0, 1, it["bpp"], len(it["data"]), i + 1)
    return items, grp


def utf16z(s):
    return s.encode("utf-16-le") + b"\x00\x00"


def pad4(b):
    while len(b) % 4:
        b += b"\x00"
    return b


def _ver_node(key, value=b"", value_len=0, text=False, children=()):
    """版本资源里的一个节点。VS_VERSIONINFO、StringFileInfo、StringTable、String、
    VarFileInfo、Var 都是同一种结构：

        wLength, wValueLength, wType, szKey(UTF-16 带结尾 0), 补齐到 4 字节,
        Value, 补齐到 4 字节, Children（每个子节点都从 4 字节边界开始）

    wLength 是整个节点（含子节点）的字节数，不含最后一个子节点之后的补齐；
    文本值（wType=1）的 wValueLength 按 WCHAR 计并含结尾 0，二进制值按字节计。
    以前这里在 Value 前面多塞了 4 字节自造的长度字段，根节点的 wValueLength 写成 0、
    VS_FIXEDFILEINFO 又缺签名，资源管理器和任务管理器因此读不出任何版本字段。
    """
    body = pad4(struct.pack("<HHH", 0, value_len, 1 if text else 0) + utf16z(key)) + value
    for child in children:
        body = pad4(body) + child
    return struct.pack("<H", len(body)) + body[2:]


def version_numbers(ver):
    """Windows 固定版本字段只能放四段数字；展示文字仍保留 beta0.1 这类标签。
    beta0.1 -> 0.1.0.0，0.1.0-beta.1 -> 0.1.0.1。"""
    parts = [int(x) for x in re.findall(r"\d+", ver)][:4]
    return tuple(parts + [0] * (4 - len(parts)))


def version_info(ver, exe_name):
    """构造 VS_VERSION_INFO 资源（块结构，每个块自带长度）。"""
    ms, mn, bld, rev = version_numbers(ver)
    # 版本号打包成两个 DWORD
    ms_hex = (ms << 16) | mn
    ls_hex = (bld << 16) | rev

    # VS_FIXEDFILEINFO 固定 13 个 DWORD（52 字节），必须以签名 0xFEEF04BD 开头：
    #   dwSignature, dwStrucVersion, dwFileVersionMS/LS, dwProductVersionMS/LS,
    #   dwFileFlagsMask, dwFileFlags, dwFileOS(VOS_NT_WINDOWS32),
    #   dwFileType(VFT_APP), dwFileSubtype, dwFileDateMS/LS
    fixed = struct.pack("<13I",
                        0xFEEF04BD, 0x00010000,
                        ms_hex, ls_hex, ms_hex, ls_hex,
                        0x3F, 0, 0x40004, 1, 0, 0, 0)
    assert len(fixed) == 52

    strings = []
    for k, v in [("CompanyName", "SZUNet"),
                 ("FileDescription", "szuDesktop 深大校园服务台"),
                 ("FileVersion", ver),
                 ("InternalName", exe_name),
                 ("OriginalFilename", exe_name + ".exe"),
                 ("ProductName", "szuDesktop"),
                 ("ProductVersion", ver),
                 ("LegalCopyright", "MIT License")]:
        payload = utf16z(v)
        strings.append(_ver_node(k, payload, len(payload) // 2, text=True))
    # 单个 StringTable（040904B0 = 英文/Unicode），与下面 Translation 的 0x409/1200 对应
    table = _ver_node("040904B0", text=True, children=strings)
    sfi = _ver_node("StringFileInfo", text=True, children=[table])
    translation = _ver_node("Translation", struct.pack("<HH", 0x409, 1200), 4)
    vfi = _ver_node("VarFileInfo", text=True, children=[translation])
    return _ver_node("VS_VERSION_INFO", fixed, len(fixed), children=[sfi, vfi])


def parse_version_info(blob):
    """按 VS_VERSIONINFO 规范解析版本资源，返回 (固定版本 dict, 字符串表 dict)。

    结构不合规（签名、长度、对齐任一不对）直接抛 ValueError。以前的 verify 只看
    「有没有 RT_VERSION 这一类」，写错结构的版本块照样通过，exe 属性里却一片空白。
    """
    blob = bytes(blob)

    def align(n):
        return (n + 3) // 4 * 4

    def node(off, end):
        if off % 4:
            raise ValueError("版本资源节点没有按 4 字节对齐（偏移 %#x）" % off)
        if off + 6 > end:
            raise ValueError("版本资源节点越界（偏移 %#x）" % off)
        length, value_len, vtype = struct.unpack_from("<HHH", blob, off)
        if length < 6 or off + length > end or vtype not in (0, 1):
            raise ValueError("版本资源节点头不对：wLength=%d wType=%d（偏移 %#x）" % (length, vtype, off))
        stop = off + length
        k = off + 6
        while k + 1 < stop and blob[k:k + 2] != b"\x00\x00":
            k += 2
        if k + 1 >= stop:
            raise ValueError("版本资源节点的键没有结尾 0（偏移 %#x）" % off)
        key = blob[off + 6:k].decode("utf-16-le")
        v = align(k + 2)
        size = value_len * 2 if vtype == 1 else value_len
        if v + size > stop:
            raise ValueError("%s 的值越过了节点末尾" % key)
        value = blob[v:v + size]
        children = []
        c = align(v + size)
        while c < stop:
            child = node(c, stop)
            children.append(child)
            c = align(c + child["length"])
        return dict(key=key, type=vtype, value=value, children=children, length=length)

    root = node(0, len(blob))
    if root["key"] != "VS_VERSION_INFO" or root["type"] != 0 or len(root["value"]) != 52:
        raise ValueError("根节点不是 VS_VERSION_INFO，或 VS_FIXEDFILEINFO 长度不是 52（wValueLength=%d）"
                         % len(root["value"]))
    f = struct.unpack("<13I", root["value"])
    if f[0] != 0xFEEF04BD:
        raise ValueError("VS_FIXEDFILEINFO 签名不对：%#x" % f[0])

    def split(ms_ls):
        ms_, ls_ = ms_ls
        return (ms_ >> 16, ms_ & 0xFFFF, ls_ >> 16, ls_ & 0xFFFF)

    fixed = dict(struc_version=f[1], file_version=split(f[2:4]), product_version=split(f[4:6]),
                 file_os=f[8], file_type=f[9])
    strings = {}
    for child in root["children"]:
        if child["key"] != "StringFileInfo":
            continue
        for table in child["children"]:
            for s in table["children"]:
                if s["type"] != 1:
                    raise ValueError("字符串 %s 不是文本类型" % s["key"])
                strings[s["key"]] = s["value"].decode("utf-16-le").rstrip("\x00")
    return fixed, strings


# ---------------------------------------------------------------- 主流程
def add_resources(exe_path, ico_path, ver, exe_name):
    pe = PE(open(exe_path, "rb").read())
    sects = pe.sections()
    if any(s["name"] == ".rsrc" for s in sects):
        print("   已经有 .rsrc 段了，跳过（先 go build 重新生成再跑本脚本）")
        return False

    items, grp = bmp_and_icon(ico_path)
    entries = [(RT_GROUP_ICON, 1, grp)]
    for i, it in enumerate(items):
        entries.append((RT_ICON, i + 1, it["data"]))
    entries.append((RT_VERSION, 1, version_info(ver, exe_name)))

    res_data, offsets, data_tbl_off = make_res_dir(entries)

    sec_align = pe.section_align()
    file_align = pe.file_align()

    # ------------------------------------------------------------
    # 段放哪：**占用 .symtab 的位置**，而不是在末尾追加。
    #
    # 试过追加到最后一个段后面，结果 exe 直接跑不起来：
    #   OSError: [WinError 193] %1 不是有效的 Win32 应用程序。
    # 原因是 Go 链接器会留一个空的 .symtab 段（只有 4 字节 +
    # 零填充，`-s -w` 也没去掉），而 Windows 加载器要求段按
    # VirtualAddress 升序排列、并且不认这种排在 .rsrc 前面的表。
    # 追加出来的段顺序变成 [... .reloc, .symtab, .rsrc]，加载器就拒了。
    #
    # .symtab 里没有任何运行时需要的东西（就是个空符号表），
    # 直接拿它的位置来用：段数不变、顺序不乱、也不用挪别的段。
    # ------------------------------------------------------------
    victim = None
    for s in sects:
        if s["name"] == ".symtab" and s["vsize"] <= 8:
            victim = s
            break

    if victim is not None:
        new_vaddr = victim["vaddr"]
        new_rawptr = victim["rawptr"]
        old_rawsize = victim["rawsize"]
        slot_off = victim["off"]
        print("   复用空的 .symtab 段（vaddr %#x，原大小 %d）" % (new_vaddr, old_rawsize))
    else:
        # 没有可复用的就追加到最后（有些构建配置下确实没有 .symtab）
        last = sects[-1]
        new_vaddr = pe.align_up(last["vaddr"] + last["vsize"], sec_align)
        new_rawptr = pe.align_up(last["rawptr"] + last["rawsize"], file_align)
        old_rawsize = 0
        slot_off = None
        print("   没有可复用的段，追加新段（vaddr %#x）" % new_vaddr)

    new_vsize = len(res_data)
    new_rawsize = pe.align_up(new_vsize, file_align)

    # 写段头
    hdr = bytearray()
    hdr += b".rsrc".ljust(8, b"\x00")                       # Name            8
    hdr += struct.pack("<IIII", new_vsize, new_vaddr,       # VirtualSize     4
                       new_rawsize, new_rawptr)             # VirtualAddress  4
                                                            # SizeOfRawData   4
                                                            # PtrToRawData    4
    hdr += struct.pack("<II", 0, 0)                         # Reloc/Lineno    8
    hdr += struct.pack("<HH", 0, 0)                         # NumReloc/NumLine 4
    hdr += struct.pack("<I", 0x40000040)                    # 已初始化数据 | 可读
    assert len(hdr) == 40, len(hdr)

    if slot_off is not None:
        pe.d[slot_off:slot_off + 40] = hdr
    else:
        room = None
        sec_table_end = pe.sec_off + pe.nsec * 40
        for probe in range(0, 40 * 4, 8):
            chunk = pe.d[sec_table_end + probe: sec_table_end + probe + 40]
            if len(chunk) < 40 or all(b == 0 for b in chunk):
                room = sec_table_end + probe
                break
        if room is None:
            raise RuntimeError("段表后面没有空位放新段头")
        pe.d[room:room + 40] = hdr
        struct.pack_into("<H", pe.d, pe.pe_off + 6, pe.nsec + 1)

    # SizeOfImage 要覆盖到新段末尾
    size_of_image_off = pe.opt_off + 56
    old_soi = struct.unpack_from("<I", pe.d, size_of_image_off)[0]
    new_soi = pe.align_up(new_vaddr + new_vsize, sec_align)
    struct.pack_into("<I", pe.d, size_of_image_off, max(old_soi, new_soi))

    # data directory[2] = 资源目录（NumberOfRvaAndSizes 本来就是 16，不用动）
    n_dirs, dd_base = pe.data_dirs()
    assert n_dirs > 2, "data directory 数量不够，放不下资源项"
    struct.pack_into("<II", pe.d, dd_base + 2 * 8, new_vaddr, new_vsize)

    # 回填资源数据块的 RVA
    buf = bytearray(res_data)
    for i, off in enumerate(offsets):
        struct.pack_into("<I", buf, data_tbl_off + 16 * i, new_vaddr + off)
    res_data = bytes(buf)

    # 写数据。
    #
    # ⚠️ 必须把文件撑到 rawptr + **new_rawsize**（对齐后的长度），不能只写到
    # 数据的实际长度。Windows 加载器会检查"每个段的 SizeOfRawData 范围内的
    # 字节在文件里都存在"，一旦 rawptr+rawsize 越过 EOF，直接拒绝整个文件：
    #     OSError: [WinError 193] %1 不是有效的 Win32 应用程序
    # 这个错误在 CreateProcess 阶段就返回，看着像"PE 头坏了"，
    # 其实只是少补了几千字节的零 —— 二分了半天才定位到。
    need = new_rawptr + new_rawsize
    if len(pe.d) < need:
        pe.d += b"\x00" * (need - len(pe.d))
    pe.d[new_rawptr:new_rawptr + len(res_data)] = res_data
    # 数据末尾到段末尾之间补零（原地写时可能留着上一段的旧字节）
    rest = min(new_rawsize, len(pe.d) - new_rawptr) - len(res_data)
    if rest > 0:
        pe.d[new_rawptr + len(res_data):new_rawptr + len(res_data) + rest] = b"\x00" * rest

    open(exe_path, "wb").write(bytes(pe.d))
    return True


def verify(exe_path, ver=None):
    pe = PE(open(exe_path, "rb").read())
    sects = pe.sections()
    rsrc = [s for s in sects if s["name"] == ".rsrc"]
    n_dirs, dd_base = pe.data_dirs()
    rva, size = struct.unpack_from("<II", pe.d, dd_base + 2 * 8)
    print("   段数 %d，.rsrc: %s" % (len(sects), "有" if rsrc else "没有"))
    print("   资源目录 RVA %#x 大小 %d 字节" % (rva, size))
    if not rsrc or rva == 0 or size == 0:
        return False
    with open(exe_path, "rb") as f:
        f.seek(rsrc[0]["rawptr"])
        blob = f.read(rsrc[0]["rawsize"])
    # 根目录里应该能找到类型 3/14/16。
    # 注意 IMAGE_RESOURCE_DIRECTORY 的字段偏移：
    #   Characteristics(0) TimeDateStamp(4) MajorVersion(8) MinorVersion(10)
    #   NumberOfNamedEntries(12) NumberOfIdEntries(14)
    # 所以 Id 项数量在 **14**，项表从 16 开始 —— 这里踩过一次，
    # 读 12 会读成 Named 数量（0），看着像"目录空的"。
    n_named, n_id = struct.unpack_from("<HH", blob, 12)
    types = []
    for i in range(n_id):
        tid, _ = struct.unpack_from("<II", blob, 16 + i * 8)
        types.append(tid)
    print("   资源类型:", sorted(types), "(named=%d id=%d)" % (n_named, n_id))
    # 三类都要在；Windows 按 ID 二分查找，根目录里的类型还必须唯一且升序
    # （以前每个图标尺寸各占一个根项，类型重复又乱序，系统一个资源都找不到）。
    uniq = set(types)
    if not ({RT_GROUP_ICON, RT_VERSION} <= uniq and RT_ICON in uniq):
        return False
    if types != sorted(uniq):
        print("   !! 根目录里的资源类型重复或没有升序，Windows 会找不到资源")
        return False
    # 光有 RT_VERSION 这一类不够：版本块结构写错时类型照样在，exe 属性里却一片空白。
    # 这里沿资源树找到版本块，按规范解析，并核对 exe 属性里要显示的字段。
    try:
        fixed, strings = parse_version_info(_version_resource(blob, rsrc[0]["vaddr"]))
    except (ValueError, struct.error) as e:
        print("   !! 版本资源解析失败：%s" % e)
        return False
    print("   文件版本 %s，%s %s（%s）" % (".".join(map(str, fixed["file_version"])),
                                      strings.get("ProductName"), strings.get("ProductVersion"),
                                      strings.get("FileDescription")))
    if not all(strings.get(k) for k in ("FileDescription", "ProductName", "CompanyName")):
        print("   !! 版本资源缺少描述、产品名或公司名")
        return False
    if ver is not None and (strings.get("FileVersion") != ver or strings.get("ProductVersion") != ver
                            or fixed["file_version"] != version_numbers(ver)
                            or fixed["product_version"] != version_numbers(ver)):
        print("   !! 版本资源与要求的版本 %s 不一致" % ver)
        return False
    return True


def _version_resource(blob, base_rva):
    """沿资源目录「类型 16 → 名字 → 语言」找到版本块，返回它的字节。"""
    def entries(off):
        n_named, n_id = struct.unpack_from("<HH", blob, off + 12)
        return [struct.unpack_from("<II", blob, off + 16 + i * 8) for i in range(n_named + n_id)]

    for tid, target in entries(0):
        if tid != RT_VERSION:
            continue
        for _ in range(2):  # 名字层、语言层都应该是子目录
            if not target & 0x80000000:
                raise ValueError("版本资源目录层级不对")
            target = entries(target & 0x7FFFFFFF)[0][1]
        if target & 0x80000000:
            raise ValueError("版本资源的叶子不是数据项")
        rva, size = struct.unpack_from("<II", blob, target)
        start = rva - base_rva
        if start < 0 or start + size > len(blob):
            raise ValueError("版本资源数据越过了 .rsrc 段")
        return blob[start:start + size]
    raise ValueError("资源目录里没有 RT_VERSION")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    exe = sys.argv[1]
    ico = None
    ver = "0.0.0"
    for i, a in enumerate(sys.argv):
        if a == "--ico" and i + 1 < len(sys.argv):
            ico = sys.argv[i + 1]
        if a == "--version" and i + 1 < len(sys.argv):
            ver = sys.argv[i + 1]
    if not ico:
        ico = os.path.join(os.path.dirname(os.path.abspath(exe)), "..",
                           "desktop", "assets", "szudesktop.ico")
    ico = os.path.abspath(ico)
    if not os.path.exists(ico):
        print("!! 找不到图标:", ico)
        sys.exit(1)
    name = os.path.splitext(os.path.basename(exe))[0]
    print(">> 写入图标与版本信息")
    changed = add_resources(exe, ico, ver, name)
    if changed:
        print("   完成，%.1f MB" % (os.path.getsize(exe) / 1024 / 1024))
    print(">> 校验资源段")
    ok = verify(exe, ver)
    print("   %s" % ("通过" if ok else "失败"))
    sys.exit(0 if ok else 1)
