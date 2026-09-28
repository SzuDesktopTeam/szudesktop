"""打一个 Windows 首版发布包：dist/szudesktop-<版本>-windows-amd64.zip

包里放什么：
  szudesktop.exe        主程序（单文件，双击就跑）
  README-快速开始.txt   给不写代码的人看的十来行：首次体验、数据与密码、版本边界，细节链到使用指南
  LICENSE               MIT

旁边另写 ZIP 与单文件 EXE 各自的 .sha256（LF 换行，可直接 sha256sum -c）。

这是与 Electron 安装版并行保留的便携包；两者使用同一份 Go 引擎与庭院资源。
Electron 安装版由 desktop/electron/build.mjs 另行打包。
默认发行版只提供官方 WebVPN 入口，不修改系统代理。

用法: python make_release.py
"""
import hashlib
import os
import sys
import zipfile
from pathlib import Path

import release_notes  # 同目录：发布说明的抽取与校验

# GitHub Windows Runner 可能使用 CP1252；中文发布日志统一输出为 UTF-8。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根，从脚本位置推
DESKTOP = os.path.join(ROOT, "desktop")
DIST = os.path.join(ROOT, "dist")
EXE = os.path.join(DIST, "szudesktop-windows-amd64.exe")
VERSION_FILE = os.path.join(ROOT, "internal", "version", "VERSION")

# 便携 ZIP 里的快速开始：写给不写代码的同学，只留十来行（怎么打开、第一次做什么、数据在哪、密码怎么存、
# 不代提交、测试版边界），其余都链到使用指南。以前这里有 70 多行，界面一改就对不上，也没人读得完。
GUIDE_URL = "https://github.com/SzuDesktopTeam/szudesktop/blob/main/docs/guide/README.md"
README = """szuDesktop __VERSION__ · 荔枝庭院（Windows x64 便携版）

1. 解压后双击 szudesktop.exe，不用安装，用本机 Edge / Chrome 打开窗口；关掉所有窗口约 10 秒后自动退出。
2. 第一次打开：选一位伙伴，在首页点「开始 5 分钟」，再到「荔枝庭院 → 我的农田」收下第一颗萝卜。这些都不需要学校账号。
3. 数据只在本机用户目录的 .szunet 文件夹：庭院 workspace-v1.json、课程笔记 notebook-v1.json（都是明文）。换电脑请在「设置 → 存档与隐私」分别导出。
4. 校园网密码只在认证成功并勾选记住后保存，用 Windows DPAPI 加密；导出的存档不含账号密码。
5. 预约、选课由你在学校官方页面自己办理，应用不代提交。请不要把密码、Cookie 或成绩发到聊天或反馈里。
6. 这是学生自制的非官方测试版：校园网认证和学校个人业务还在测试，以学校系统为准；程序没有数字签名，也不会自动更新。
7. 便携版没有桌面伙伴和托盘；想要它们，请下载 szuDesktop-Setup 安装版。

使用指南：""" + GUIDE_URL + """
源码与反馈：https://github.com/SzuDesktopTeam/szudesktop
"""


def read_version():
    """版本号只有一个来源：internal/version/VERSION（Go 二进制也嵌入同一个文件）。"""
    ver = open(VERSION_FILE, encoding="utf-8").read().strip()
    if not ver:
        print("!! %s 是空的，包名和快速开始都会写错版本" % VERSION_FILE)
        sys.exit(1)
    return ver


def quickstart_problems(text=README):
    """快速开始模板的约定：够短、链到使用指南、关键的安全与数据说明一句不少。返回问题清单，空表示没问题。

    打包前先查一遍，免得有人往里加回一大段安装版说明、或删掉「不代提交」这类说明而没人发现。
    检查脚本也可以 import 这个函数单独核对。
    """
    problems = []
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) > 12:
        problems.append("快速开始有 %d 行，超过 12 行：细节请写进使用指南" % len(lines))
    for must, why in ((GUIDE_URL, "使用指南链接"), ("__VERSION__", "版本号占位符"), (".szunet", "数据存放位置"),
                      ("明文", "笔记与存档是明文"), ("DPAPI", "密码怎么加密"), ("不代提交", "不代提交"),
                      ("非官方", "非官方说明"), ("没有数字签名", "未签名说明")):
        if must not in text:
            problems.append("快速开始少了%s（应包含「%s」）" % (why, must))
    return problems


def check_changelog(ver):
    """打包前先确认 CHANGELOG.md 里写好了这个版本的发布说明。

    CI 的 release job 会再拦一次，但拦在打包之前更有用：VERSION 一升、
    CHANGELOG 忘了写，PR 阶段就会红，而不是等打完 tag 才发现说明是空的
    （beta0.7 就是这样发出去的，正文只有一行 compare 链接）。
    """
    try:
        release_notes.extract(release_notes.load(), ver)
    except release_notes.NotesError as e:
        print("!! " + str(e))
        sys.exit(1)
    except OSError as e:
        print("!! 读不到 CHANGELOG.md: %s" % e)
        sys.exit(1)


def main():
    ver = read_version()
    check_changelog(ver)
    problems = quickstart_problems()
    if problems:
        print("!! " + "；".join(problems))
        sys.exit(1)
    if not os.path.exists(EXE):
        print("!! 还没有编好的 exe，先跑 desktop/build-windows.py")
        sys.exit(1)

    out = os.path.join(DIST, "szudesktop-%s-windows-amd64.zip" % ver)
    exe_bytes = open(EXE, "rb").read()

    if os.path.exists(out):
        os.remove(out)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        # 包里的文件名用 ascii，避免某些解压工具处理中文名出问题
        z.writestr("szudesktop.exe", exe_bytes)
        z.writestr("README-快速开始.txt", README.replace("__VERSION__", ver))
        z.writestr("FONT-LICENSE-OFL.txt", Path(DESKTOP, "assets", "fonts", "LICENSE-OFL.txt").read_bytes())
        z.writestr("2048-MIT.txt", Path(DESKTOP, "assets", "garden", "licenses", "2048-MIT.txt").read_bytes())
        z.writestr("Three-MIT.txt", Path(DESKTOP, "assets", "garden", "vendor", "three", "LICENSE.txt").read_bytes())
        z.writestr("Sakura-Crossing-MIT.txt", Path(DESKTOP, "assets", "garden", "vendor", "sakura", "LICENSE.txt").read_bytes())
        z.writestr("LICENSE", Path(ROOT, "LICENSE").read_bytes())
        z.writestr("THIRD_PARTY_NOTICES.md", Path(ROOT, "THIRD_PARTY_NOTICES.md").read_bytes())

    # newline="\n" 不能省：这个脚本在 Windows 上跑（CI 的 windows 任务也一样），
    # 文本模式默认把 \n 翻成 \r\n，下载者用 Linux/macOS 的 sha256sum -c 会直接失败
    # （coreutils 不会去掉行尾的 \r，会当成文件名的一部分）。
    Path(out+".sha256").write_text(hashlib.sha256(Path(out).read_bytes()).hexdigest()+"  "+os.path.basename(out)+"\n", encoding="ascii", newline="\n")
    # 单文件 EXE 也单独发布，同样要能离线核对（从镜像、网盘或同学那里拿到时）。
    Path(EXE+".sha256").write_text(hashlib.sha256(exe_bytes).hexdigest()+"  "+os.path.basename(EXE)+"\n", encoding="ascii", newline="\n")
    # 打印清单 + 校验和，方便发布时贴出去
    print("->", out)
    print("   压缩前 %.1f MB / 压缩后 %.1f MB"
          % (len(exe_bytes) / 1024 / 1024, os.path.getsize(out) / 1024 / 1024))
    print("   版本 %s" % ver)
    print("   EXE sha256 %s" % hashlib.sha256(exe_bytes).hexdigest())
    print("   ZIP sha256 %s" % hashlib.sha256(Path(out).read_bytes()).hexdigest())
    with zipfile.ZipFile(out) as z:
        if z.read("szudesktop.exe") != Path(EXE).read_bytes():
            raise RuntimeError("包内程序与当前构建不一致，请重新打包")
        print("   包内文件:")
        for i in z.infolist():
            print("     %-28s %8d 字节" % (i.filename, i.file_size))


if __name__ == "__main__":
    main()
