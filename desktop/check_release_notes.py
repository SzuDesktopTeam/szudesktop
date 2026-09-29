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


# ───── macOS DMG（MAC_SINCE 开关）─────
# DMG 的名字写在三处：electron-builder.yml 的 dmg.artifactName（打包）、release.yml 的附件清单（上传）、
# 这里的下载说明（给用户看）。B1–B9 真机验收（STATUS 68.2）通过之前 MAC_SINCE 为 None：release 不等 macOS 的 job、
# 不上传 DMG，说明里也不列，Windows 版照常发布。开启时这几处要在同一个 PR 里一起改，STATUS 68.2 也必须全部通过；
# 任何一处没跟上，发布页上就会写着不存在的文件，或者发出没验收过的包。
import contextlib  # noqa: E402
import fnmatch  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402

MAC_BODY = "## beta0.9.5\n\n- macOS 版\n"
# 开启 DMG 发布时 release 必须等的两个 job：打包加 Apple 芯片冒烟、真 Intel 机器冒烟。
MAC_JOBS = ("build-desktop-electron-macos", "smoke-desktop-electron-macos-intel")


@contextlib.contextmanager
def mac_since(value):
    """临时改掉 DMG 发布开关，核对开启（或关闭）时的渲染结果；结束时还原。"""
    saved = release_notes.MAC_SINCE
    release_notes.MAC_SINCE = value
    try:
        yield
    finally:
        release_notes.MAC_SINCE = saved


def read_repo(*parts):
    with open(os.path.join(release_notes.ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def dmg_names(semver):
    """按 electron-builder.yml 的 dmg.artifactName 展开两个架构的 DMG 名（不依赖 PyYAML）。"""
    block = re.search(r"^dmg:[ \t]*\n((?:[ \t]+.*\n|[ \t]*\n)*)", read_repo("desktop", "electron", "electron-builder.yml"), re.M)
    assert block, "electron-builder.yml 里没有 dmg 段"
    pattern = re.search(r"^[ \t]+artifactName:[ \t]*(\S+)[ \t]*$", block.group(1), re.M)
    assert pattern, "electron-builder.yml 的 dmg 段没有 artifactName"
    names = [pattern.group(1).replace("${version}", semver).replace("${arch}", arch).replace("${ext}", "dmg")
             for arch in ("arm64", "x64")]
    assert all("$" not in name for name in names), "dmg.artifactName 里有这里不认识的宏：" + pattern.group(1)
    return names


def release_job(workflow):
    """release.yml 里 release job 的原文，到下一个 job 或文件末尾为止。"""
    lines = workflow.splitlines()
    start = lines.index("  release:")
    end = next((i for i in range(start + 1, len(lines)) if re.fullmatch(r"  [a-z][a-z0-9-]*:", lines[i])), len(lines))
    return "\n".join(lines[start:end])


def release_files(job):
    """release job 里 action-gh-release 的 files 清单（每行一个 glob）。"""
    lines = job.splitlines()
    start = next(i for i, line in enumerate(lines) if re.fullmatch(r"\s+files: \|", line))
    indent = len(lines[start]) - len(lines[start].lstrip())
    files = []
    for line in lines[start + 1:]:
        if line.strip() and len(line) - len(line.lstrip()) <= indent:
            break
        if line.strip():
            files.append(line.strip())
    return files


def release_needs(job):
    found = re.search(r"^    needs: \[(.*)\]$", job, re.M)
    assert found, "release job 的 needs 不是单行列表，这里读不出来"
    return [name.strip() for name in found.group(1).split(",")]


def b_status(status):
    """STATUS 68.2 表格里 B1–B9 各行的「状态」列。"""
    start = status.index('<a id="s68-2"></a>')
    end = status.index('<a id="s68-3"></a>', start)
    rows = {}
    for line in status[start:end].splitlines():
        row = re.match(r"\|\s*(B\d+)\s*\|.*\|\s*([^|]*?)\s*\|\s*$", line)
        if row:
            rows[row.group(1)] = row.group(2)
    return rows


def mac_release_problems(since, workflow, status):
    """DMG 发布开关与 release.yml、STATUS 68.2 是否一致；返回问题清单，空表示一致。"""
    job = release_job(workflow)
    files, needs = release_files(job), release_needs(job)
    problems = []
    if since is None:
        problems += ["MAC_SINCE 没有开启，release.yml 却会上传 " + f for f in files if ".dmg" in f]
        if "szudesktop-electron-macos" in job:
            problems.append("MAC_SINCE 没有开启，release job 却下载了 DMG 产物")
        problems += ["MAC_SINCE 没有开启，release 却在等 %s：Windows 版会被 macOS 的 job 卡住" % j for j in MAC_JOBS if j in needs]
        return problems
    for name in dmg_names(".".join(map(str, since))):
        for asset in (name, name + ".sha256"):
            if not any(fnmatch.fnmatchcase("dist/" + asset, pattern) for pattern in files):
                problems.append("release.yml 不会上传 " + asset)
    if not re.search(r"^\s+name: szudesktop-electron-macos$", job, re.M):
        problems.append("release job 没有下载 szudesktop-electron-macos")
    problems += ["release 的 needs 里没有 " + j for j in MAC_JOBS if j not in needs]
    rows = b_status(status)
    if sorted(rows) != sorted("B%d" % i for i in range(1, 10)):
        problems.append("STATUS 68.2 应当正好是 B1–B9 九行，读到 " + "、".join(sorted(rows)))
    pending = sorted(k for k, v in rows.items() if not v.startswith("通过"))
    if pending:
        problems.append("STATUS 68.2 还有没通过的真机验收：" + "、".join(pending))
    return problems


def wire_mac_release(workflow):
    """按 release.yml 注释里的步骤接上 DMG 发布，只用来核对上面的检查认得出接好的样子。"""
    wired = workflow.replace(
        "needs: [build-cli, build-desktop-windows, build-desktop-electron-windows, test-macos]",
        "needs: [build-cli, build-desktop-windows, build-desktop-electron-windows, test-macos, " + ", ".join(MAC_JOBS) + "]")
    wired = wired.replace(
        "      - name: 上传前核对全部校验文件\n",
        "      - uses: actions/download-artifact@0 # 占位\n        with:\n          name: szudesktop-electron-macos\n"
        "          path: dist\n      - name: 上传前核对全部校验文件\n")
    wired = wired.replace(
        "          fail_on_unmatched_files: true\n",
        "".join("            dist/szuDesktop-*-mac-%s.dmg%s\n" % (arch, ext) for arch in ("arm64", "x64") for ext in ("", ".sha256"))
        + "          fail_on_unmatched_files: true\n")
    assert wired.count("szudesktop-electron-macos") == workflow.count("szudesktop-electron-macos") + 1 and ".dmg\n" in wired \
        and wired.count(", ".join(MAC_JOBS) + "]") == 1, "release.yml 的 release job 变了，wire_mac_release 需要跟着改"
    return wired


def test_mac_switch_matches_workflow_and_status():
    workflow, status = read_repo(".github", "workflows", "release.yml"), read_repo("docs", "STATUS.md")
    problems = mac_release_problems(release_notes.MAC_SINCE, workflow, status)
    assert not problems, "DMG 发布开关与 release.yml / STATUS 68.2 对不上：" + "；".join(problems)


def test_mac_gate_blocks_until_wired_and_accepted():
    workflow, status = read_repo(".github", "workflows", "release.yml"), read_repo("docs", "STATUS.md")
    wired = wire_mac_release(workflow)
    accepted = re.sub(r"(\|\s*B\d+\s*\|.*\|\s*)待验收(\s*\|\s*)$", r"\1通过\2", status, flags=re.M)
    # 只改开关、不接 release.yml：缺附件、缺下载、缺 needs 都要报出来。
    alone = "；".join(mac_release_problems((0, 9, 5), workflow, accepted))
    for part in ("不会上传 szuDesktop-0.9.5-mac-arm64.dmg", "不会上传 szuDesktop-0.9.5-mac-x64.dmg.sha256",
                 "没有下载 szudesktop-electron-macos", "needs 里没有 smoke-desktop-electron-macos-intel"):
        assert part in alone, "只开开关时没有报出：" + part
    # 接好了但真机验收还没做完：必须拦下。
    if "待验收" in status:
        assert any("没通过的真机验收" in p for p in mac_release_problems((0, 9, 5), wired, status)), "B 类没通过也放行了 DMG"
    # 接好、验收全部通过：放行。
    assert mac_release_problems((0, 9, 5), wired, accepted) == [], "接好且验收通过时不应再报问题"
    # 反过来，没开开关却接上了：同样要报，免得悄悄上传没在说明里写的 DMG。
    assert len(mac_release_problems(None, wired, status)) >= 3, "没开开关却上传 DMG、等 macOS 的 job 时没有报出"


def test_mac_off_keeps_windows_notes():
    with mac_since(None):
        for version in ("beta0.9.5", "v1.0.0", "beta0.9.4"):
            out = release_notes.render("## %s\n\n- 正文\n" % version, version, release=True)
            assert ".dmg" not in out and "Apple 公证" not in out, version + "：DMG 发布没开启时不能列出 DMG"
        # 这一版不发 DMG 而 CHANGELOG 正文在介绍 DMG：打 tag 时拦下；平时预览照常。
        mac_entry = "## beta0.9.5\n\n- macOS 桌面版：Apple 芯片选 `mac-arm64.dmg`\n"
        expect_error(lambda: release_notes.render(mac_entry, "beta0.9.5", release=True), "不发 DMG 的版本正文里写了 DMG")
        assert "mac-arm64.dmg" in release_notes.render(mac_entry, "beta0.9.5"), "非发布模式只是预览，不该拦"
    with mac_since((0, 9, 5)):
        assert "`szuDesktop-0.9.5-mac-arm64.dmg`" in release_notes.render(mac_entry, "beta0.9.5", release=True), "开启后正文可以介绍 DMG"


def test_mac_downloads_follow_installer():
    with mac_since((0, 9, 5)):
        lines = release_notes.render(MAC_BODY, "beta0.9.5").splitlines()
        future = release_notes.render("## v1.0.0\n\n- 正式版\n", "v1.0.0")
    installer = next(i for i, line in enumerate(lines) if "`szuDesktop-Setup-0.9.5.exe`" in line)
    arm = next(i for i, line in enumerate(lines) if "`szuDesktop-0.9.5-mac-arm64.dmg`" in line)
    x64 = next(i for i, line in enumerate(lines) if "`szuDesktop-0.9.5-mac-x64.dmg`" in line)
    assert (arm, x64) == (installer + 1, installer + 2), "两个 DMG 应紧跟在 Windows 安装包那一行之后"
    assert "Apple 芯片" in lines[arm] and "Intel" in lines[x64], "DMG 说明没写清按芯片怎么选"
    assert all(".sha256" in lines[i] for i in (arm, x64)), "DMG 旁边的同名 .sha256 没写"
    assert "`szuDesktop-1.0.0-mac-arm64.dmg`" in future and "`szuDesktop-1.0.0-mac-x64.dmg`" in future, "之后的版本也要带 DMG"


def test_mac_note_and_placeholders():
    with mac_since((0, 9, 5)):
        out = release_notes.render(MAC_BODY, "beta0.9.5")
    note = next(line for line in out.splitlines() if line.startswith("macOS 版未经 Apple 公证"))
    assert "macOS 13" in note and "隐私与安全性" in note and "仍要打开" in note, "首次打开的放行步骤没写全：" + note
    assert out.index("`szuDesktop-0.9.5-mac-x64.dmg`") < out.index(note), "放行说明应在下载清单之后"
    assert "__" not in out, "DMG 下载清单还留着占位符"


def test_no_dmg_before_mac_since():
    with mac_since((0, 9, 5)):
        for version in ("beta0.9.4", "beta0.9.3", "beta0.8.0", "beta0.7.1"):
            out = release_notes.render("## %s\n\n- 正文\n" % version, version)
            assert ".dmg" not in out and "Apple 公证" not in out, version + " 没有 macOS 桌面版，不能虚构 DMG 附件"
        current = release_notes.render(SAMPLE, "beta0.7.1")
    assert ".dmg" not in current, "旧版本不应凭空多出 DMG"


def test_dmg_names_match_packaging():
    with mac_since((0, 9, 5)):
        out = release_notes.render(MAC_BODY, "beta0.9.5")
    for name in dmg_names("0.9.5"):
        assert "`%s`" % name in out, "下载说明里的 DMG 名与 dmg.artifactName 的展开结果不一致：" + name


check("DMG 发布开关与 release.yml、STATUS 68.2 一致（没开启时 release 不等 macOS 的 job、不上传 DMG）", test_mac_switch_matches_workflow_and_status)
check("开启 DMG 发布要同时接好 needs、下载与附件，且 B1–B9 全部通过", test_mac_gate_blocks_until_wired_and_accepted)
check("DMG 发布没开启时说明不列 DMG，正文介绍 DMG 的版本打 tag 时被拦下", test_mac_off_keeps_windows_notes)
check("开启后两个 DMG 紧跟在 Windows 安装包之后，各带 .sha256", test_mac_downloads_follow_installer)
check("DMG 版本写明未公证、最低 macOS 13 与首次打开的放行步骤，不留占位符", test_mac_note_and_placeholders)
check("开启后 MAC_SINCE 之前的版本仍不出现 DMG", test_no_dmg_before_mac_since)
check("DMG 名与 dmg.artifactName 的展开结果一致", test_dmg_names_match_packaging)


# ───── 升级基线缓存（build-desktop-electron-windows）─────
# 以前每次运行都从 Releases 下载一次基线安装包，CI 的下载量盖过了真实用户，而下载计数是估计试用规模的唯一客观数字。
# 现在按 smoke_installer.py 固定的 SHA-256 取缓存，未命中才下载，核对哈希后紧接着存回缓存（后面的冒烟失败也不耽误下次命中）。
# 有人把下载挪回取缓存之前、删掉保存或把保存挪到冒烟之后，这里就失败。
import subprocess  # noqa: E402

BASELINE_KEY = "szu-upgrade-baseline-${{ steps.baseline.outputs.sha256 }}"


def job_steps(workflow, name):
    """某个 job 的各个步骤原文（去掉整行注释），按 `      - ` 切开。"""
    lines = workflow.splitlines()
    start = lines.index("  %s:" % name)
    end = next((i for i in range(start + 1, len(lines)) if re.fullmatch(r"  [a-z][a-z0-9-]*:", lines[i])), len(lines))
    steps = []
    for line in lines[start + 1:end]:
        if line.lstrip().startswith("#"):
            continue
        if line.startswith("      - "):
            steps.append(line)
        elif steps:
            steps[-1] += "\n" + line
    return steps


def baseline_cache_problems(steps):
    """升级基线是否先取缓存、未命中才下载、下载核对后立即存回；返回问题清单，空表示接好了。"""
    at = lambda pred: [i for i, step in enumerate(steps) if pred(step)]
    baseline = at(lambda s: re.search(r"^\s+id: baseline$", s, re.M))
    restore = at(lambda s: "uses: actions/cache/restore@" in s and "key: " + BASELINE_KEY in s)
    download = at(lambda s: "gh release download" in s)
    save = at(lambda s: "uses: actions/cache/save@" in s and "key: " + BASELINE_KEY in s)
    smoke = at(lambda s: re.search(r"run: python desktop/electron/smoke_installer\.py$", s, re.M))
    problems = []
    if len(baseline) != 1 or "smoke_installer.py --baseline" not in steps[baseline[0]] or "sha256=" not in steps[baseline[0]]:
        problems.append("没有一步（id: baseline）从 smoke_installer.py --baseline 读出标签、附件名和 SHA-256")
    if len(restore) != 1 or not re.search(r"^\s+id: baseline-cache$", steps[restore[0]], re.M):
        problems.append("没有按固定 SHA-256 取缓存的 actions/cache/restore（id: baseline-cache）")
    if len(download) != 1:
        problems.append("基线下载应当正好出现在一步里，读到 %d 步" % len(download))
    elif restore and restore[0] > download[0]:
        problems.append("gh release download 出现在取缓存之前，每次运行都会下载")
    elif not all(part in steps[download[0]] for part in ("Get-FileHash", "BASELINE_SHA256")):
        problems.append("下载那一步没有先核对缓存里的哈希、下载后也没有核对固定的 SHA-256")
    if len(save) != 1 or "if: steps.baseline-cache.outputs.cache-hit != 'true'" not in steps[save[0]]:
        problems.append("没有只在缓存未命中时执行的 actions/cache/save")
    elif len(download) == 1 and save[0] != download[0] + 1:
        problems.append("保存缓存要紧跟在下载那一步之后，冒烟失败也不影响下次命中")
    if len(smoke) != 1 or (save and smoke[0] < save[0]):
        problems.append("安装冒烟应当在准备好基线之后运行")
    paths = {m for i in restore + save for m in re.findall(r"^\s+path: (.+)$", steps[i], re.M)}
    if len(paths) != 1:
        problems.append("取缓存和存缓存的 path 不一致：" + "、".join(sorted(paths)))
    return problems


def test_baseline_cache_wiring():
    steps = job_steps(read_repo(".github", "workflows", "release.yml"), "build-desktop-electron-windows")
    problems = baseline_cache_problems(steps)
    assert not problems, "升级基线缓存没接好：" + "；".join(problems)
    # 反过来确认这条检查认得出坏掉的接法：删掉取缓存、下载挪到取缓存之前、保存挪到冒烟之后。
    find = lambda needle: next(i for i, s in enumerate(steps) if needle in s)
    restore, download, save = find("actions/cache/restore@"), find("gh release download"), find("actions/cache/save@")
    smoke = next(i for i, s in enumerate(steps) if s.rstrip().endswith("run: python desktop/electron/smoke_installer.py"))
    without = steps[:restore] + steps[restore + 1:]
    assert any("actions/cache/restore" in p for p in baseline_cache_problems(without)), "没取缓存时没有报出"
    early = list(steps)
    early[restore], early[download] = steps[download], steps[restore]
    assert any("取缓存之前" in p for p in baseline_cache_problems(early)), "下载在取缓存之前时没有报出"
    late = steps[:save] + steps[save + 1:smoke + 1] + [steps[save]] + steps[smoke + 1:]
    assert any("紧跟" in p for p in baseline_cache_problems(late)), "保存挪到冒烟之后时没有报出"


def test_baseline_cli_matches_pin():
    source = read_repo("desktop", "electron", "smoke_installer.py")
    pinned = re.search(r'^BASELINE_SHA256 = "([0-9a-f]{64})"$', source, re.M)
    assert pinned, "smoke_installer.py 里没有固定的 BASELINE_SHA256"
    script = os.path.join(release_notes.ROOT, "desktop", "electron", "smoke_installer.py")
    out = subprocess.run([sys.executable, script, "--baseline"], capture_output=True, text=True, encoding="utf-8",
                         timeout=60, check=True).stdout.split()
    assert len(out) == 3, "--baseline 应当只输出标签、附件名和 SHA-256 三项，读到：%r" % out
    tag, asset, digest = out
    assert re.fullmatch(r"(?:beta|v)\d+\.\d+(?:\.\d+)?", tag), "基线标签格式不对：" + tag
    assert asset == "szuDesktop-Setup-%s.exe" % re.sub(r"^(?:beta|v)", "", tag), "附件名与标签对不上：" + asset
    assert digest == pinned.group(1), "--baseline 输出的 SHA-256 与固定值不一致，缓存键会和冒烟核对的哈希对不上"


check("升级基线先按固定 SHA-256 取缓存，未命中才下载，核对后紧接着存回缓存", test_baseline_cache_wiring)
check("smoke_installer.py --baseline 输出标签、附件名和固定的 SHA-256", test_baseline_cli_matches_pin)

print("%d release-notes checks passed" % count)
