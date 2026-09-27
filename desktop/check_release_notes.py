"""发布说明抽取的回归检查：python desktop/check_release_notes.py

CHANGELOG.md 是 GitHub Release 正文的唯一来源。抽取逻辑一旦出错，
发出去的说明就会是空的、或者带上别的版本的内容——beta0.7 那次
只发了一行 compare 链接，就是因为没有这道关卡。
"""
import sys

# 与 make_release.py / smoke_windows.py 一致：GitHub 的 Windows runner 可能是 CP1252，
# 中文检查名统一按 UTF-8 输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

import release_notes  # noqa: E402

SAMPLE = """# 更新日志

格式约定：每节以 `## <版本号>` 开头。

## 未发布

- 还没发的东西

## beta0.7.1

修复版：只含一个安全修复。

### 相对 beta0.7 的变化

- macOS 保存凭据不再经命令行参数暴露

## beta0.7

- 设置页可开关开机自启
"""

count = 0


def check(name, fn):
    global count
    fn()
    count += 1
    print("PASS " + name)


def expect_error(fn, why):
    """必须抛 NotesError，而且错误信息不能是空的——用户得看得懂该改什么。"""
    try:
        fn()
    except release_notes.NotesError as e:
        if not str(e).strip():
            raise AssertionError(why + "：错误信息是空的")
        return
    raise AssertionError(why + "：居然没报错")


def test_extracts_section():
    body = release_notes.extract(SAMPLE, "beta0.7.1")
    assert "修复版：只含一个安全修复。" in body, "正文没抽到"
    assert "### 相对 beta0.7 的变化" in body, "小节标题被吃掉了"


def test_stops_at_next_version():
    body = release_notes.extract(SAMPLE, "beta0.7.1")
    assert "设置页可开关开机自启" not in body, "串到下一节去了"


def test_excludes_heading_itself():
    body = release_notes.extract(SAMPLE, "beta0.7")
    assert not body.lstrip().startswith("##"), "标题行被当成正文了"


def test_version_must_match_exactly():
    body = release_notes.extract(SAMPLE, "beta0.7")
    assert "macOS" not in body, "beta0.7 命中了 beta0.7.1 的内容"


def test_render_fills_download_list():
    out = release_notes.render(SAMPLE, "beta0.7.1")
    assert "szudesktop-beta0.7.1-windows-amd64.zip" in out, "桌面 ZIP 名字不对"
    assert "szunet-darwin-arm64" in out, "命令行附件缺了"
    assert "__VERSION__" not in out, "占位符没替换"


def test_render_keeps_body_before_download_list():
    out = release_notes.render(SAMPLE, "beta0.7.1")
    assert out.index("修复版") < out.index("szudesktop-beta0.7.1-windows-amd64.zip"), "顺序不对"


def test_installer_download_versions():
    current = release_notes.render("## beta0.8.0\n\n- Electron 安装版\n", "beta0.8.0")
    assert "szuDesktop-Setup-0.8.0.exe" in current, "安装包名不符合 semver 命名"
    assert "szudesktop-beta0.8.0-windows-amd64.zip" in current, "旧版便携包必须保留"
    assert ".sha256" in current, "缺少安装包校验说明"
    assert "__SEMVER__" not in current, "安装包版本占位符没有替换"
    assert "szuDesktop-Setup" not in release_notes.render(SAMPLE, "beta0.7.1"), "旧版本不应凭空多出安装包"


check("抽取到对应版本那一节的正文", test_extracts_section)
check("在下一个版本标题处停下，不带进 beta0.7 的内容", test_stops_at_next_version)
check("返回的正文不含标题行本身", test_excludes_heading_itself)
check("版本号必须精确匹配，beta0.7 不会命中 beta0.7.1", test_version_must_match_exactly)
check("render 把版本号填进下载清单", test_render_fills_download_list)
check("render 保留正文，再追加下载清单", test_render_keeps_body_before_download_list)
check("新版本包含安装包，旧版本不虚构附件", test_installer_download_versions)

CANDIDATE = """## beta0.9.3

> 候选版：尚未公开发布；当前公开下载仍为 beta0.9.2。

这一版把庭院和课程笔记放进同一个日常空间。

- 新功能

## beta0.9.2

- 四位桌面伙伴
"""


def test_candidate_line_dropped():
    for release in (False, True):
        body = release_notes.extract(CANDIDATE, "beta0.9.3", release=release)
        assert "候选版" not in body and "尚未公开发布" not in body, "候选版提示行进了正文"
        assert body.startswith("这一版把庭院"), "丢掉提示行后正文开头不对：" + body[:20]
        assert "- 新功能" in body, "正文被吃掉了"


def test_default_mode_tolerates_candidate_wording():
    # make_release.py 在 PR 阶段走默认模式：候选版的说法不能让它变红。
    text = "## beta0.9.3\n\n**本地候选版，尚未公开发布；当前公开下载仍为 beta0.9.2。** 正文\n"
    assert "本地候选版" in release_notes.extract(text, "beta0.9.3")


def test_render_checksum_downloads():
    current = release_notes.render(CANDIDATE, "beta0.9.3")
    exe_line = next(line for line in current.splitlines() if "`szudesktop-windows-amd64.exe`" in line)
    cli_line = next(line for line in current.splitlines() if line.startswith("- 命令行版"))
    assert ".sha256" in exe_line and ".sha256" in cli_line, "新版本的单文件 EXE 和命令行版应注明校验文件"
    old = release_notes.render(CANDIDATE, "beta0.9.2")
    exe_line = next(line for line in old.splitlines() if "`szudesktop-windows-amd64.exe`" in line)
    cli_line = next(line for line in old.splitlines() if line.startswith("- 命令行版"))
    assert ".sha256" not in exe_line and ".sha256" not in cli_line, "旧版本没有这些校验文件，不能虚构"
    assert "__" not in current + old, "下载清单还留着占位符"


def test_release_tag_matches_version():
    release_notes.check_release_tag("beta0.9.3", "beta0.9.3")


def test_cli_release_mode():
    # 走一遍 CI 真正调用的命令行路径：标签与 VERSION 不一致时，在抽取正文前就失败。
    import io
    import contextlib
    with open(release_notes.VERSION_FILE, encoding="utf-8") as f:
        version = f.read().strip()
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        code = release_notes.main(["release_notes.py", version + "-mismatch", "--release"])
    assert code == 1 and "internal/version/VERSION" in err.getvalue(), err.getvalue()
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        code = release_notes.main(["release_notes.py", "--release"])
    assert code == 2, "缺版本号应给出用法提示"


check("候选版提示行在两种模式下都不进正文", test_candidate_line_dropped)
check("默认模式（make_release）不因候选版字样报错", test_default_mode_tolerates_candidate_wording)
check("beta0.9.3 起单文件 EXE 与命令行版注明 .sha256，旧版本不虚构", test_render_checksum_downloads)
check("标签与 VERSION 一致时通过", test_release_tag_matches_version)
check("发布模式命令行：标签与 VERSION 不一致立即失败", test_cli_release_mode)

check("CHANGELOG 里没有这个版本时报错",
      lambda: expect_error(lambda: release_notes.extract(SAMPLE, "beta0.8"), "缺版本"))
check("只有标题、正文是空的也报错",
      lambda: expect_error(lambda: release_notes.extract("## beta0.9\n\n## beta0.8\n\n正文\n", "beta0.9"), "空正文"))
check("正文只有空白字符同样报错",
      lambda: expect_error(lambda: release_notes.extract("## beta0.9\n   \n\n## beta0.8\n\n正文\n", "beta0.9"), "空白正文"))
check("不能拿「未发布」当版本号发布",
      lambda: expect_error(lambda: release_notes.extract(SAMPLE, "未发布"), "未发布"))
check("正文里留着未替换的占位符时报错",
      lambda: expect_error(lambda: release_notes.extract("## beta0.9\n\n- 修复了 __VERSION__ 的问题\n", "beta0.9"), "占位符"))
check("发布模式下正文仍写着「尚未公开发布」时报错",
      lambda: expect_error(lambda: release_notes.extract(
          "## beta0.9.3\n\n**本地候选版，尚未公开发布；当前公开下载仍为 beta0.9.2。** 正文\n",
          "beta0.9.3", release=True), "候选版字样"))
check("发布模式下提示行之外还有「本地候选版」时报错",
      lambda: expect_error(lambda: release_notes.extract(
          "## beta0.9.3\n\n> 候选版：尚未公开发布\n\n本地候选版的正文\n", "beta0.9.3", release=True), "残留字样"))
check("发布模式下标签与 VERSION 不一致时报错",
      lambda: expect_error(lambda: release_notes.check_release_tag("beta0.9.4", "beta0.9.3"), "标签不一致"))

print("%d release-notes checks passed" % count)
