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
    if numbers >= (0, 8, 0):
        installer = ELECTRON_DOWNLOAD.replace("__SEMVER__", ".".join(match.groups()))
        downloads = downloads.replace("### 下载\n\n", "### 下载\n\n" + installer)
    return extract(text, version, release) + "\n\n---\n\n" + downloads


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
