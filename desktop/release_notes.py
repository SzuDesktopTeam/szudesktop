"""从 CHANGELOG.md 抽取某个版本的发布说明。

用法:
    python desktop/release_notes.py beta0.8                        # 打印到标准输出（本地预览）
    python desktop/release_notes.py beta0.8 --release -o notes.md  # 发布模式（CI 按 tag 调用）

CHANGELOG.md 是 GitHub Release 正文的唯一来源。抽不到、正文是空的、
或者正文里还留着占位符，都以非零退出码失败——CI 的 release job 会在上传
附件之前停下来。beta0.7 那次发布说明只有一行 compare 链接，就是因为
当时没有任何关卡拦着。

候选版阶段可以在该节里写一行 `> 候选版：……` 提醒读者，抽取时这一行总会被丢掉。
`--release` 是打 tag 发布时的严格模式：标签必须等于 internal/version/VERSION，
正文里也不能再出现「尚未公开发布」「本地候选版」这类字样——否则 Release 第一句
就会告诉用户「本版尚未发布」，和同一页上的附件自相矛盾。PR 阶段的
make_release.py 走的是默认模式，不受这条限制。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHANGELOG = os.path.join(ROOT, "CHANGELOG.md")
VERSION_FILE = os.path.join(ROOT, "internal", "version", "VERSION")

UNRELEASED = "未发布"
# 候选版提示行：只在仓库里给读 CHANGELOG 的人看，不进 Release 正文。
CANDIDATE_PREFIX = "> 候选版"
# 发布模式下正文里不许再出现的候选版字样。
CANDIDATE_MARKERS = ("尚未公开发布", "本地候选版")

# 附件名与 CI 实际上传的一致（release.yml 的 build-cli + make_release.py）。
# 按 beta0.7.1 的真实附件列表核对过，别凭印象写。
DOWNLOADS = """### 下载

- `szudesktop-__VERSION__-windows-amd64.zip` — 解压即用，旁边是同名 `.sha256` 校验文件
- `szudesktop-windows-amd64.exe` — 单文件版，与 ZIP 里的程序逐字节一致__EXE_SUM__
- 命令行版：`szunet-windows-amd64.exe`、`szunet-darwin-amd64`、`szunet-darwin-arm64`、`szunet-linux-amd64`、`szunet-linux-arm64`__CLI_SUM__
"""

ELECTRON_DOWNLOAD = "- `szuDesktop-Setup-__SEMVER__.exe` — Windows 安装版（Electron 窗口），旁边是同名 `.sha256` 校验文件\n"

# macOS 版按芯片各一个 DMG（electron-builder.yml 的 dmg.artifactName），各带同名 .sha256。
# MAC_SINCE 既是 DMG 发布的开关，也是第一个带 DMG 的版本号：这一版及以后的下载清单列出两个 DMG，
# release.yml 的 release job 等 macOS 打包和真 Intel 冒烟两个 job、上传两个 DMG；回看更早的版本不会虚构附件。
# 原定 B1–B9 真机验收（docs/STATUS.md 68.2）全部通过才开启；维护者 2026-09-29 决定 macOS 版以预览版随 beta0.9.5
# 发布（STATUS 68.4），所以从 0.9.5 开启，真机验收仍待做。check_release_notes.py 核对这里、release.yml 与 STATUS 一致。
MAC_SINCE = (0, 9, 5)
# 预览版开关：值是 STATUS 里记录维护者预览版决定那一节的锚点（<a id="…"></a>）。68.2 的 B1–B9 还有没通过的，
# 它就必须指向那条决定，每一版的发布说明都带上下面的预览版说明；B1–B9 全部通过后改回 None，说明随之去掉。
# check_release_notes.py 两个方向都核对：有待验收的项却没开、全部通过了还开着，都会失败。
MAC_PREVIEW = "s68-4"
MAC_DOWNLOADS = (
    "- `szuDesktop-__SEMVER__-mac-arm64.dmg` — macOS 版，Apple 芯片（M1 及更新）选这个，旁边是同名 `.sha256` 校验文件\n"
    "- `szuDesktop-__SEMVER__-mac-x64.dmg` — macOS 版，Intel 处理器选这个，旁边是同名 `.sha256` 校验文件\n"
)
# 没有公证，第一次打开会被系统拦下；不写清怎么放行，用户只会以为包坏了。
MAC_NOTE = "\nmacOS 版未经 Apple 公证，需要 macOS 13 或更高版本；首次打开时到「系统设置 → 隐私与安全性」点「仍要打开」。\n"
# 预览版说明紧跟在放行步骤之后：哪些还没有人在真机上验过（对应 68.2 的 B1–B9）、遇到问题去哪里说。
# 这一版的 CHANGELOG 正文会写得更细；这里是下载清单旁的简短提示，之后的版本正文不再重复时也不会漏掉。
# 反馈目前只有 GitHub Issues；不需要 GitHub 账号的渠道还没定（STATUS 1.1），定了再改这里。
MAC_PREVIEW_NOTE = (
    "\nmacOS 版目前是预览版：已通过自动化的打包、安装和启动检查，但浏览器下载后的首次放行、注销与登录时启动、"
    "系统通知、钥匙串、多显示器、macOS 13 和 14、校园网里的「本地网络」授权等，还没有人在真机上逐项验收"
    "（[进度](https://github.com/SzuDesktopTeam/szudesktop/blob/main/docs/STATUS.md#s68-2)）。"
    "遇到问题请在 [GitHub Issues](https://github.com/SzuDesktopTeam/szudesktop/issues/new/choose) 选「问题反馈」"
    "（需要 GitHub 账号），写明芯片（Apple 芯片或 Intel）和 macOS 版本。\n"
)

# beta0.9.3 起，单文件 EXE 与每个命令行版也各带同名 .sha256；更早的版本没有，不能虚构。
ALL_CHECKSUMS_SINCE = (0, 9, 3)


class NotesError(Exception):
    """发布说明不可用。错误信息直接给发版的人看，要写清该改什么。"""


def check_release_tag(tag, version=None):
    """发布模式：标签必须等于 internal/version/VERSION。

    不一致时要在 CI 最早的 job 里就停下，而不是等全部构建跑完、到上传附件时才因为
    文件名对不上失败——那时标签已经公开，只能删掉重打。
    """
    if version is None:
        with open(VERSION_FILE, encoding="utf-8") as f:
            version = f.read().strip()
    if tag != version:
        raise NotesError(
            "标签 %s 与 internal/version/VERSION（%s）不一致：先改 VERSION 和 CHANGELOG.md，"
            "再打标签（已推送的错误标签需要删掉重打）" % (tag, version))


def extract(text, version, release=False):
    """返回 CHANGELOG.md 里 `## <version>` 那一节的正文（不含标题）。

    以 `> 候选版` 开头的行总会被丢掉；release=True（打 tag 发布）时，剩余正文
    仍含候选版字样就报错。"""
    if version == UNRELEASED:
        raise NotesError(
            "「%s」不是版本号：发版前请把 CHANGELOG.md 里那一节的标题改成真实版本号" % UNRELEASED)

    heading = "## " + version
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        # 只接受完全相等的标题，否则 beta0.7 会命中 beta0.7.1
        if line.strip() == heading:
            start = i + 1
            break
    if start is None:
        raise NotesError(
            "CHANGELOG.md 里没有 `## %s` 这一节。发版前必须先写好这个版本的更新说明" % version)

    body = []
    for line in lines[start:]:
        if line.startswith("## "):
            break
        if line.lstrip().startswith(CANDIDATE_PREFIX):
            continue
        body.append(line)
    text_body = "\n".join(body).strip()

    if not text_body:
        raise NotesError("CHANGELOG.md 的 `## %s` 一节是空的，不能发一个没有说明的版本" % version)
    if "__VERSION__" in text_body:
        raise NotesError("CHANGELOG.md 的 `## %s` 一节里还留着 __VERSION__ 占位符" % version)
    if release:
        found = [m for m in CANDIDATE_MARKERS if m in text_body]
        if found:
            raise NotesError(
                "CHANGELOG.md 的 `## %s` 一节里还写着「%s」，发出去会成为 Release 正文。"
                "候选版提示请单独写成一行 `%s：……`（发布时自动去掉），其余正文改成已发布的说法"
                % (version, "」「".join(found), CANDIDATE_PREFIX))
    return text_body


def render(text, version, release=False):
    """正文 + 下载清单。清单由版本号生成，所以 CHANGELOG 里不要自己写。"""
    downloads = DOWNLOADS.replace("__VERSION__", version)
    match = re.fullmatch(r"(?:beta|v)?(\d+)\.(\d+)\.(\d+)", version)
    numbers = tuple(map(int, match.groups())) if match else ()
    # 回看旧版本时不能虚构不存在的附件：安装版从 beta0.8.0 开始分发，
    # 单文件 EXE 与命令行版的 .sha256 从 beta0.9.3 开始提供。
    all_sums = numbers >= ALL_CHECKSUMS_SINCE
    downloads = downloads.replace("__EXE_SUM__", "，旁边是同名 `.sha256` 校验文件" if all_sums else "")
    downloads = downloads.replace("__CLI_SUM__", "，各带同名 `.sha256` 校验文件" if all_sums else "")
    mac = MAC_SINCE is not None and numbers >= MAC_SINCE
    if numbers >= (0, 8, 0):
        installer = ELECTRON_DOWNLOAD.replace("__SEMVER__", ".".join(match.groups()))
        # 两个 DMG 紧跟在 Windows 安装包之后：都是带窗口的安装版，按系统挑一个。
        if mac:
            installer += MAC_DOWNLOADS.replace("__SEMVER__", ".".join(match.groups()))
        downloads = downloads.replace("### 下载\n\n", "### 下载\n\n" + installer)
    if mac:
        downloads += MAC_NOTE
        if MAC_PREVIEW:
            downloads += MAC_PREVIEW_NOTE
    body = extract(text, version, release)
    # 这一版不发 DMG，正文却在介绍 DMG：发布页上会写着不存在的附件，等于把没发布的包说成能下载。
    # 只在打 tag 时拦（test job 第一步就会失败），「未发布」一节平时照常可以先写好 macOS 的条目。
    if release and not mac and ".dmg" in body:
        raise NotesError(
            "CHANGELOG.md 的 `## %s` 一节提到了 .dmg，但这一版不发布 DMG（desktop/release_notes.py 的 MAC_SINCE 没有覆盖这个版本）："
            "把 macOS 桌面版的条目留在「未发布」一节，或按 CONTRIBUTING.md「发布」一节开启 DMG 发布"
            % version)
    return body + "\n\n---\n\n" + downloads


def load(path=CHANGELOG):
    with open(path, encoding="utf-8") as f:
        return f.read()


def main(argv):
    args = argv[1:]
    out = None
    if "-o" in args:
        i = args.index("-o")
        if i + 1 >= len(args):
            print("!! -o 后面要跟输出文件", file=sys.stderr)
            return 2
        out = args[i + 1]
        del args[i:i + 2]
    release = "--release" in args
    positional = [a for a in args if a != "--release"]
    if len(positional) != 1 or positional[0].startswith("-"):
        print("用法: python desktop/release_notes.py <版本号> [--release] [-o 输出文件]", file=sys.stderr)
        return 2
    version = positional[0]

    try:
        if release:
            check_release_tag(version)
        body = render(load(), version, release)
    except OSError as e:
        print("!! 读不到 %s: %s" % (e.filename or CHANGELOG, e), file=sys.stderr)
        return 1
    except NotesError as e:
        print("!! " + str(e), file=sys.stderr)
        return 1

    if out:
        # newline="\n"：CI 的 windows 任务会用文本模式写文件，默认把 \n 翻成 \r\n
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            f.write(body + "\n")
        print("-> %s（%d 字节）" % (out, len(body.encode("utf-8"))))
    else:
        sys.stdout.write(body + "\n")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main(sys.argv))
