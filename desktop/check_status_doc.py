"""文档锚点与 STATUS 标题检查：python desktop/check_status_doc.py

README 中英两版、CHANGELOG、SECURITY、CONTRIBUTING 都深链到 docs/STATUS.md 的某一节，
文件内部也有不少 `#锚点` 跳转。STATUS 以前把「未发布」「源码候选」这类会变的状态写在
标题里，一改标题，按标题生成的锚点就变，外部链接悄无声息地断掉；已经公开发布的章节
标题还挂着「未发布」，读者会误判状态（见 STATUS 开头的「标题与链接」约定）。

检查三件事：
1. 各文件内部的 `](#锚点)` 链接都能找到目标：按 GitHub 的标题 slug 规则（github-slugger），
   或是 `<a id="…"></a>` 显式锚点。
2. 指向 STATUS.md 的链接一律落在标题前的显式稳定锚点（`<a id="sNN"></a>`）上，且锚点存在；
   这几份文件之间互相深链的锚点也必须存在。
3. STATUS.md 的节标题（## 及以下）不含「未发布」「未合并」「源码候选」「开发中」这类会变的
   发布状态；「已随 beta0.x 发布」是终态，允许保留。已公开发布版本的章节因此不会再标成未发布。

新增检查按 desktop/check_*.py 命名，desktop/run-checks.mjs 会自动发现并运行。
"""
import os
import posixpath
import re
import sys
import unicodedata
from urllib.parse import unquote

# GitHub 的 Windows runner 可能是 CP1252，中文检查名统一按 UTF-8 输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS = "docs/STATUS.md"
# 被检查的文件（仓库相对路径）。不存在的跳过，方便以后增删。
DOCS = ["README.md", "docs/README_en.md", "CHANGELOG.md", STATUS, "SECURITY.md", "CONTRIBUTING.md"]
# 仓库自己的 GitHub 地址：写成绝对链接的深链也按仓库内文件核对。
REPO_URL = re.compile(r"^https://github\.com/SzuDesktopTeam/szudesktop/(?:blob|tree)/[^/]+/(.+)$", re.I)

STALE_HEADING = re.compile("未发布|未合并|源码候选|开发中")
HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$")
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
EXPLICIT = re.compile(r"""<a\s+(?:[^>]*?\s)?(?:id|name)\s*=\s*["']([^"']+)["']""", re.I)
INLINE_LINK = re.compile(r"\]\(\s*(<[^>]*>|[^)\s]+)")
REF_DEF = re.compile(r"^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)")
HREF = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)


def github_slug(text):
    """按 github-slugger 的规则把标题文字变成锚点（不含重名编号）。

    先去掉渲染时不显示的 Markdown 标记（行内代码的反引号、链接和图片只留文字、HTML 标签），
    再转小写，只保留字母、数字、组合符号、连接标点（如 _）、空格和连字符，最后空格换成连字符。
    中文标点（，（）：。）和英文标点、emoji 都会被删掉。
    """
    text = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("`", "").strip().lower()
    kept = [ch for ch in text if ch in " -" or unicodedata.category(ch)[0] in "LMN" or unicodedata.category(ch) == "Pc"]
    return "".join(kept).replace(" ", "-")


def outside_code(lines):
    """逐行给出 (行号, 去掉行内代码后的内容, 原行)，跳过围栏代码块。"""
    fence = None
    for number, line in enumerate(lines, 1):
        match = FENCE.match(line)
        if match:
            marker = match.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            continue
        if fence is None:
            yield number, re.sub(r"`+[^`]*`+", "", line), line


class Doc:
    def __init__(self, rel, text):
        self.rel = rel
        self.headings = []  # (行号, 级别, 标题文字)
        self.slugs = set()
        self.explicit = set()
        self.links = []  # (行号, 链接目标)
        seen = {}
        for number, line, raw in outside_code(text.splitlines()):
            self.explicit.update(EXPLICIT.findall(line))
            heading = HEADING.match(raw)
            if heading:
                title = heading.group(2)
                self.headings.append((number, len(heading.group(1)), title))
                base = github_slug(title)
                count = seen.get(base, 0)
                seen[base] = count + 1
                self.slugs.add(base if count == 0 else "%s-%d" % (base, count))
            for pattern in (INLINE_LINK, HREF):
                for target in pattern.findall(line):
                    self.links.append((number, target.strip("<>")))
            ref = REF_DEF.match(line)
            if ref:
                self.links.append((number, ref.group(1).strip("<>")))

    def has_anchor(self, fragment):
        return fragment in self.slugs or fragment in self.explicit


def resolve(source, target):
    """把链接目标解析成 (仓库相对路径, 锚点)；外站链接、没有锚点的链接返回 None。"""
    match = REPO_URL.match(target)
    if match:
        target = match.group(1)
    elif re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I) or target.startswith("//"):
        return None
    path, sep, fragment = target.partition("#")
    if not sep or not fragment:
        return None
    path = path.split("?", 1)[0]
    if path:
        # 以 / 开头的是仓库根相对路径（GitHub 的写法），否则相对于链接所在文件。
        base = "" if path.startswith("/") else posixpath.dirname(source)
        path = posixpath.normpath(posixpath.join(base, unquote(path).lstrip("/")))
    else:
        path = source
    return path, unquote(fragment)


def check_docs(docs):
    """返回全部问题（字符串列表）。docs: {仓库相对路径: Doc}。"""
    problems = []
    for rel, doc in docs.items():
        for number, target in doc.links:
            resolved = resolve(rel, target)
            if resolved is None:
                continue
            path, fragment = resolved
            dest = docs.get(path)
            if dest is None:
                continue  # 只核对这几份文件之间的锚点
            where = "%s:%d → %s" % (rel, number, target)
            if path == STATUS and rel != STATUS:
                if fragment not in dest.explicit:
                    why = "指向标题生成的锚点，改标题就会断" if fragment in dest.slugs else "STATUS.md 里没有这个锚点"
                    problems.append("%s：%s；请链接到标题前的显式锚点 <a id=\"sNN\"></a>（没有就先在 STATUS 里补一行）"
                                    % (where, why))
            elif not dest.has_anchor(fragment):
                problems.append("%s：%s 里没有这个锚点（按 GitHub 标题 slug 或 <a id> 都找不到）" % (where, path))
    status = docs.get(STATUS)
    if status is not None:
        for number, level, title in status.headings:
            stale = STALE_HEADING.search(title)
            if level >= 2 and stale:
                problems.append("%s:%d 标题写着会变的发布状态「%s」：%s；状态请写在标题下的「写入时状态」一行"
                                % (STATUS, number, stale.group(0), title))
    return problems


def load(root):
    docs = {}
    for rel in DOCS:
        path = os.path.join(root, *rel.split("/"))
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as handle:
                docs[rel] = Doc(rel, handle.read())
    return docs


def self_test():
    """先确认检查本身按 GitHub 的规则工作，免得一个坏掉的 slug 函数让全部链接「通过」。"""
    cases = {
        "1.1 当前未完成事项": "11-当前未完成事项",
        "65. 全应用界面与状态一致性（2026-09-27，源码未发布）": "65-全应用界面与状态一致性2026-09-27源码未发布",
        "Command line `szunet`": "command-line-szunet",
        "Build & verify": "build--verify",
        "[F21](#f21) macOS 凭据": "f21-macos-凭据",
        "snake_case 保留下划线": "snake_case-保留下划线",
    }
    for title, want in cases.items():
        got = github_slug(title)
        assert got == want, "github_slug(%r) = %r，期望 %r" % (title, got, want)

    status = "\n".join([
        "# 总清单", "", "## 1. 当前状态", "", "见 [1.1](#11-当前未完成事项) 和 [重名](#记录-1)。", "",
        '<a id="s1-1"></a>', "", "### 1.1 当前未完成事项", "", "## 记录", "", "## 记录", "",
        "```", "## 65. 代码块里的标题（未发布）不算", "[坏链接](#不存在)", "```", "",
        "## 64. 已随 beta0.9.2 发布的旧标题", "",
    ])
    readme = "\n".join([
        "# 自述", "", "## 下载", "", "[跳到下载](#下载)，[状态](docs/STATUS.md#s1-1)，"
        "[绝对链接](https://github.com/SzuDesktopTeam/szudesktop/blob/main/docs/STATUS.md#s1-1)，"
        "`[行内代码](#不存在)` 不算链接，[外站](https://example.com/#x)。",
    ])
    docs = {STATUS: Doc(STATUS, status), "README.md": Doc("README.md", readme)}
    assert check_docs(docs) == [], check_docs(docs)

    broken = dict(docs)
    broken["README.md"] = Doc("README.md", readme + "\n[标题锚点](docs/STATUS.md#11-当前未完成事项)"
                                                     "\n[内部断链](#不存在的标题)\n[外部断链](docs/STATUS.md#s99)")
    broken[STATUS] = Doc(STATUS, status + "\n## 66. 新功能（2026-09-28，源码未发布）\n")
    problems = check_docs(broken)
    assert len(problems) == 4, problems
    assert any("改标题就会断" in line for line in problems), problems
    assert any("#不存在的标题" in line for line in problems), problems
    assert any("s99" in line and "没有这个锚点" in line for line in problems), problems
    assert any("源码未发布" in line and "STATUS.md:" in line for line in problems), problems

    en = Doc("docs/README_en.md", "# Readme\n\n[status](STATUS.md#s1-1) [zh](../README.md#下载) [bad](../README.md#nope)\n")
    problems = check_docs({**docs, "docs/README_en.md": en})
    assert len(problems) == 1 and "#nope" in problems[0], problems


def main():
    self_test()
    docs = load(ROOT)
    if STATUS not in docs:
        print("!! 找不到 %s，请从仓库里运行" % STATUS)
        return 1
    problems = check_docs(docs)
    for line in problems:
        print("!!", line)
    links = sum(len(doc.links) for doc in docs.values())
    print("文档锚点检查：%d 份文件、%d 个链接、STATUS %d 个标题与 %d 个显式锚点，问题 %d 个"
          % (len(docs), links, len(docs[STATUS].headings), len(docs[STATUS].explicit), len(problems)))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
