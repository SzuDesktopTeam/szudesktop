"""Windows 图标与版本资源的回归检查：python desktop/check_version_resource.py

add_resource.py 手写资源目录和 VS_VERSIONINFO。以前根目录里类型重复又乱序、
语言项指向数据块而不是数据项，版本块的 wValueLength 写成 0、VS_FIXEDFILEINFO
缺签名、每个值前面还多塞了 4 字节。校验只看「有没有 RT_VERSION 这一类」，
于是 CI 一直是绿的，发布的 exe 却没有图标，资源管理器「详细信息」、任务管理器和
防火墙弹窗里也读不出名称和版本。这里按规范逐字节核对；在 Windows 上再交给系统自己的
VerQueryValueW 读一遍，那就是资源管理器用的同一个解析器。整机上的最终结果由
smoke_windows.py 用 GetFileVersionInfoW / ExtractIconExW 核对。
"""
import re
import struct
import sys
from pathlib import Path

# 与其它检查脚本一致：GitHub 的 Windows runner 可能是 CP1252，中文检查名统一按 UTF-8 输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

import add_resource  # noqa: E402

VERSION = (Path(__file__).resolve().parents[1] / "internal" / "version" / "VERSION").read_text(encoding="ascii").strip()
BLOB = add_resource.version_info(VERSION, "szudesktop")
EXPECTED = {
    "CompanyName": "SZUNet",
    "FileDescription": "szuDesktop 深大校园服务台",
    "FileVersion": VERSION,
    "InternalName": "szudesktop",
    "OriginalFilename": "szudesktop.exe",
    "ProductName": "szuDesktop",
    "ProductVersion": VERSION,
    "LegalCopyright": "MIT License",
}

count = 0


def check(name, fn):
    global count
    fn()
    count += 1
    print("PASS " + name)


def expect_invalid(blob, why):
    try:
        add_resource.parse_version_info(blob)
    except ValueError as e:
        if not str(e).strip():
            raise AssertionError(why + "：错误信息是空的")
        return
    raise AssertionError(why + "：结构不合规却被当成有效版本块")


def test_root_header():
    length, value_len, vtype = struct.unpack_from("<HHH", BLOB, 0)
    assert length == len(BLOB), ("根节点 wLength 应覆盖整个版本块", length, len(BLOB))
    assert value_len == 52, ("根节点 wValueLength 必须是 VS_FIXEDFILEINFO 的 52 字节", value_len)
    assert vtype == 0, "根节点的值是二进制，wType 应为 0"
    assert BLOB[6:38] == add_resource.utf16z("VS_VERSION_INFO"), "根节点键名不对"
    # 6 字节头 + 32 字节键名 = 38，补齐到 40 后才是 VS_FIXEDFILEINFO
    signature, struc = struct.unpack_from("<II", BLOB, 40)
    assert signature == 0xFEEF04BD, "VS_FIXEDFILEINFO 缺签名 0xFEEF04BD：%#x" % signature
    assert struc == 0x00010000, "dwStrucVersion 应为 0x00010000"


def test_fixed_versions():
    fixed, _ = add_resource.parse_version_info(BLOB)
    expected = add_resource.version_numbers(VERSION)
    assert fixed["file_version"] == expected, fixed
    assert fixed["product_version"] == expected, fixed
    assert fixed["file_os"] == 0x40004 and fixed["file_type"] == 1, "应标记为 Windows NT 上的应用程序"


def test_version_numbers():
    # 测试版 beta0.9.7、正式版 v1.0.0（CHANGELOG.md「格式约定」）。以前这里只去掉 beta 前缀，
    # VERSION 一改成 v1.0.0，int("v1") 就让发版 PR 的检查变红。
    parsed = re.fullmatch(r"(?:beta|v)(\d+)\.(\d+)\.(\d+)", VERSION)
    assert parsed, "VERSION（%s）应是 beta 或 v 前缀加三段数字" % VERSION
    assert add_resource.version_numbers(VERSION) == tuple(map(int, parsed.groups())) + (0,)
    fixed, strings = add_resource.parse_version_info(add_resource.version_info("v1.0.0", "szudesktop"))
    assert fixed["file_version"] == fixed["product_version"] == (1, 0, 0, 0), fixed
    assert strings["FileVersion"] == strings["ProductVersion"] == "v1.0.0", strings
    assert add_resource.version_numbers("beta0.9.7") == (0, 9, 7, 0)
    assert add_resource.version_numbers("beta0.1") == (0, 1, 0, 0)
    assert add_resource.version_numbers("0.1.0-beta.1") == (0, 1, 0, 1)
    assert add_resource.version_numbers("v1.2.3.4.5") == (1, 2, 3, 4)


def test_strings_round_trip():
    _, strings = add_resource.parse_version_info(BLOB)
    assert strings == EXPECTED, strings


def test_string_value_length_counts_wchars():
    # String 的 wValueLength 以 WCHAR 计，含结尾 0；Explorer 按它截取显示文字。
    for key, value in EXPECTED.items():
        at = BLOB.index(add_resource.utf16z(key))
        _, value_len, vtype = struct.unpack_from("<HHH", BLOB, at - 6)
        assert vtype == 1, key + " 应是文本类型"
        assert value_len == len(add_resource.utf16z(value)) // 2, (key, value_len)


# 与 add_resources() 的顺序一致：图标组、各尺寸图标、版本信息。
ENTRIES = [(add_resource.RT_GROUP_ICON, 1, b"grp-dir"),
           (add_resource.RT_ICON, 1, b"\x89PNG 16px"),
           (add_resource.RT_ICON, 2, b"\x89PNG 32px!"),
           (add_resource.RT_ICON, 3, b"\x89PNG 256px"),
           (add_resource.RT_VERSION, 1, BLOB)]
BASE_RVA = 0x7000


def built_tree():
    """和真实写入 exe 时一样拼目录、回填 RVA。"""
    res, offsets, table = add_resource.make_res_dir(ENTRIES)
    buf = bytearray(res)
    for i, off in enumerate(offsets):
        struct.pack_into("<I", buf, table + 16 * i, BASE_RVA + off)
    return bytes(buf)


def directory(tree, off):
    n_named, n_id = struct.unpack_from("<HH", tree, off + 12)
    return [struct.unpack_from("<II", tree, off + 16 + 8 * i) for i in range(n_named + n_id)]


def test_resource_tree_is_searchable():
    # Windows 在每层目录里按 ID 二分查找：同层 ID 必须唯一且升序，叶子指向数据项。
    tree = built_tree()
    root = directory(tree, 0)
    assert [tid for tid, _ in root] == [3, 14, 16], ("根目录类型必须唯一且升序", root)
    for tid, target in root:
        assert target & 0x80000000, "类型项应指向子目录"
        names = directory(tree, target & 0x7FFFFFFF)
        ids = [nid for nid, _ in names]
        assert ids == sorted(set(ids)), ("名字 ID 必须唯一且升序", tid, ids)
        for nid, sub in names:
            assert sub & 0x80000000, "名字项应指向语言子目录"
            [(lang, leaf)] = directory(tree, sub & 0x7FFFFFFF)
            assert lang == 0x409 and not leaf & 0x80000000, "语言项应是叶子"
            rva, size, _, _ = struct.unpack_from("<IIII", tree, leaf)
            payload = next(p for t, n, p in ENTRIES if (t, n) == (tid, nid))
            assert tree[rva - BASE_RVA:rva - BASE_RVA + size] == payload, ("叶子没有指向对应的数据", tid, nid)


def test_resource_tree_lookup():
    # verify() 沿资源目录找版本块，必须找回同一份字节。
    assert add_resource._version_resource(built_tree(), BASE_RVA) == BLOB, "资源目录里找回的版本块不对"


def test_rejects_broken_blocks():
    bad = bytearray(BLOB)
    struct.pack_into("<I", bad, 40, 0)
    expect_invalid(bytes(bad), "缺签名")
    bad = bytearray(BLOB)
    struct.pack_into("<H", bad, 2, 0)  # 以前的写法：根节点 wValueLength=0
    expect_invalid(bytes(bad), "根节点 wValueLength=0")
    bad = bytearray(BLOB)
    struct.pack_into("<H", bad, 0, len(BLOB) + 8)
    expect_invalid(bytes(bad), "wLength 越界")
    expect_invalid(b"\x00\x00" + BLOB, "整体错位 2 字节")


def test_windows_api_reads_fields():
    import ctypes
    from ctypes import wintypes
    api = ctypes.WinDLL("version")
    api.VerQueryValueW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR,
                                   ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.UINT)]
    api.VerQueryValueW.restype = wintypes.BOOL
    # GetFileVersionInfoW 给出的缓冲区是「资源字节 + 同样大小的空白」，这里照样准备。
    buf = ctypes.create_string_buffer(BLOB + b"\x00" * len(BLOB))

    def query(path):
        ptr, size = ctypes.c_void_p(), wintypes.UINT()
        assert api.VerQueryValueW(buf, path, ctypes.byref(ptr), ctypes.byref(size)) and size.value, \
            "VerQueryValueW 读不到 " + path
        return ptr, size.value

    ptr, size = query("\\")
    assert size == 52 and struct.unpack("<I", ctypes.string_at(ptr, 4))[0] == 0xFEEF04BD
    ptr, size = query("\\VarFileInfo\\Translation")
    assert ctypes.string_at(ptr, size) == struct.pack("<HH", 0x409, 1200)
    for key, value in EXPECTED.items():
        ptr, size = query("\\StringFileInfo\\040904B0\\" + key)
        assert ctypes.wstring_at(ptr) == value and size == len(value) + 1, (key, ctypes.wstring_at(ptr), size)


check("根节点 wValueLength=52，VS_FIXEDFILEINFO 带签名且 4 字节对齐", test_root_header)
check("固定版本号与文件类型", test_fixed_versions)
check("测试版（beta）与正式版（v）标签都换算成四段数字", test_version_numbers)
check("字符串表能按规范读回全部字段", test_strings_round_trip)
check("文本值长度按 WCHAR 计并含结尾 0", test_string_value_length_counts_wchars)
check("资源目录各层 ID 唯一升序，叶子经数据项指向对应数据", test_resource_tree_is_searchable)
check("verify 能沿资源目录找到版本块", test_resource_tree_lookup)
check("签名、长度或对齐不对的版本块会被拒绝", test_rejects_broken_blocks)
if sys.platform == "win32":
    check("Windows 自己的 VerQueryValueW 读得出版本、描述和产品名", test_windows_api_reads_fields)
else:
    print("SKIP Windows VerQueryValueW（非 Windows 平台）")

print("%d version-resource checks passed" % count)
