"""macOS 安装版冒烟：挂载最终的 DMG，把 .app 复制到带中文和空格的临时目录，真启动、真退出。

用法:
    python desktop/electron/smoke_dmg.py --arch arm64            # 一次性的 GitHub macOS runner 上
    python3 desktop/electron/smoke_dmg.py --arch x64 --local     # 开发机上必须显式加 --local（Apple 芯片上经 Rosetta）
    ... --dmg <路径>                                             # 默认 desktop/electron/release/szuDesktop-<版本>-mac-<arch>.dmg

不安装进「应用程序」、不登记登录项、不用真实账号：配置目录、Electron 资料目录和钥匙串条目都按本次临时目录隔离
（桌面引擎在设置了 SZUNET_CONFIG_DIR 时，钥匙串服务名带 -test-<配置目录哈希>）。只结束自己启动的进程。
依次核对：
1. DMG 与同名 .sha256、hdiutil verify、UDZO 格式。
2. 只读挂载，卷上只有 .app 和指向 /Applications 的链接（外加 dmgbuild 固定写入的三个隐藏文件），用 ditto 复制出来。
3. 签名、Info.plist、最低系统版本、主程序与 Contents/MacOS/szudesktop-engine 的架构、引擎与 dist 逐字节一致、
   Resources 里没有可执行代码、语言包只剩 en 与 zh_CN、菜单栏模板图、许可文件（check_licenses.py 的 .app 模式）。
4. 真启动：smoke-report.mjs 的报告里界面、宠物、菜单栏图标、点穿、备份恢复都为真，mac 字段（应用菜单、程序坞、
   模板图、跨桌面显示、渲染进程的平台与设置页文案、登录项不可用）全部为真。
5. 退出后自带的引擎随之退出、没有残留进程；6. 再开一次，宠物缩放保持 1.7。
7. 真实的 quit Apple Event（与 ⌘Q、程序坞退出、注销时系统发来的是同一种）：退出轨迹依次走过保存握手、
   关窗和停引擎，没有 session-end。runner 上被系统拒绝（-1743）时记为跳过并警告，--local 时必须通过。
8. 先起 dist 里的引擎，.app 复用它（owned=False），.app 退出后它仍在。
9. 「卸载」（删掉复制出来的 .app）前后，工作区和宠物设置逐字节不变。
收尾：从 LaunchServices 注销复制出来的 .app；--local 时还原 com.szudesktop.app 偏好（defaults export / import，
不直接拷 plist，免得被 cfprefsd 的缓存覆盖）、删掉本次新建的 ~/Library 缓存目录，并核对真实钥匙串条目没变。
证据写到 desktop/electron/release/smoke-evidence-mac-<arch>/，写完把 64 位十六进制的令牌打码。
"""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "desktop"))
sys.path.insert(0, str(HERE))
import mac_upgrade
import smoke_macos  # noqa: E402  钥匙串命名规则与只读查询共用一份

APP_ID = "com.szudesktop.app"
ENGINE_ID = "com.szudesktop.engine"
PRODUCT = "szuDesktop"
ENGINE_IN_APP = "Contents/MacOS/szudesktop-engine"
GO_ARCH = {"arm64": "arm64", "x64": "amd64"}
MACHO_ARCH = {"arm64": "arm64", "x64": "x86_64"}
LOCALES = ["en.lproj", "zh_CN.lproj"]
# electron-builder 通过 dmgbuild 总会写进卷里的隐藏文件：窗口布局、卷图标、背景图。
DMG_HIDDEN = {".DS_Store", ".VolumeIcon.icns", ".background.tiff"}
MACHO_MAGIC = {0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca}
TRAY_TEMPLATES = ["szudesktop-trayTemplate.png", "szudesktop-trayTemplate@2x.png"]
# 退出协调（quit-coordinator.mjs）在保存握手成功时依次记下的节点。
QUIT_TRACE = ["before-quit", "prepare-sent", "prepared", "confirmed", "windows-closed", "engine-stopped"]
LSREGISTER = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
# --local 时核对这些 ~/Library 子目录里有没有本次新建的 szuDesktop 条目（偏好走 defaults，不在这里删）。
LIBRARY_DIRS = ["Application Support", "Caches", "HTTPStorages", "Logs", "Saved Application State", "WebKit"]
TOKEN_HEX = re.compile(r"(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])")
QUIT_SCRIPT = """ObjC.import('AppKit');
function run(argv){
  const target=$.NSRunningApplication.runningApplicationWithProcessIdentifier(parseInt(argv[0],10));
  if(target.isNil())return 'missing';
  return target.terminate?'sent':'refused';
}"""

check = smoke_macos.check
run = smoke_macos.run


def version_info():
    version = (ROOT / "internal" / "version" / "VERSION").read_text(encoding="utf-8").strip()
    check("valid release version", re.fullmatch(r"(?:beta|v)?\d+\.\d+\.\d+", version) is not None)
    return version, re.sub(r"^(?:beta|v)", "", version)


def default_companions():
    """按源码里的名册核对包内阵容，加伙伴不用另维护一份名单（同 smoke_installer）。"""
    catalog = (ROOT / "desktop" / "assets" / "garden" / "pet-catalog.mjs").as_uri()
    source = "import {AVAILABLE_PETS} from " + json.dumps(catalog) + ";console.log(JSON.stringify(AVAILABLE_PETS));"
    return json.loads(subprocess.check_output(["node", "--input-type=module", "--eval", source], text=True, encoding="utf-8"))


def macos_version_at_least(have, need):
    parse = lambda text: [int(part) for part in str(text).split(".")]
    a, b = parse(have), parse(need)
    width = max(len(a), len(b))
    return a + [0] * (width - len(a)) >= b + [0] * (width - len(b))


def volume_is_clean(entries):
    """卷上只允许 .app、指向「应用程序」的链接，以及 dmgbuild 固定写入的那几个隐藏文件。"""
    hidden = {name for name in entries if name.startswith(".")}
    return set(entries) - hidden == {PRODUCT + ".app", "Applications"} and hidden <= DMG_HIDDEN


def trace_in_order(names, wanted=QUIT_TRACE):
    """按子序列核对退出轨迹：真实退出在 confirmed 之后还会再记一次 before-quit（关窗触发 window-all-closed），不能要求逐项相等。"""
    remaining = iter(names)
    return all(any(name == step for name in remaining) for step in wanted)


def is_macho(path):
    with open(path, "rb") as f:
        head = f.read(4)
    return len(head) == 4 and int.from_bytes(head, "big") in MACHO_MAGIC


def plist_value(plist, key):
    with open(plist, "rb") as f:
        return plistlib.load(f).get(key)


def minos(binary):
    found = re.search(r"^\s*minos\s+(\S+)", run(["/usr/bin/vtool", "-show-build", str(binary)]).stdout, re.M)
    return found.group(1) if found else None


def check_dmg(dmg):
    digest = hashlib.sha256(dmg.read_bytes()).hexdigest()
    check("DMG exists: " + dmg.name, dmg.is_file())
    check("DMG .sha256 matches (ASCII, LF, two spaces, bare name)",
          Path(str(dmg) + ".sha256").read_bytes() == ("%s  %s\n" % (digest, dmg.name)).encode("ascii"))
    verify = run(["/usr/bin/hdiutil", "verify", str(dmg)])
    check("hdiutil verify", verify.returncode == 0)
    info = plistlib.loads(subprocess.check_output(["/usr/bin/hdiutil", "imageinfo", "-plist", str(dmg)]))
    check("DMG format is UDZO", info.get("Format") == "UDZO")
    return digest


def attach(dmg, mountpoint):
    """只读、不在 Finder 里显示、不自动打开；hdiutil 偶发「Resource busy」这类瞬时失败，最多试 3 次。"""
    mountpoint.mkdir(parents=True)
    for attempt in range(3):
        r = run(["/usr/bin/hdiutil", "attach", "-nobrowse", "-readonly", "-noautoopen", "-noverify",
                 "-mountpoint", str(mountpoint), str(dmg)])
        if r.returncode == 0:
            return
        print("!! hdiutil attach 第 %d 次失败：%s" % (attempt + 1, r.stderr.strip()), flush=True)
        time.sleep(5)
    raise RuntimeError("hdiutil attach failed three times")


def detach(mountpoint):
    for args in (["detach"], ["detach"], ["detach", "-force"]):
        if not os.path.ismount(mountpoint):
            return
        r = run(["/usr/bin/hdiutil", *args, str(mountpoint)])
        if r.returncode == 0:
            return
        print("!! hdiutil %s：%s" % (" ".join(args), r.stderr.strip()), flush=True)
        time.sleep(3)
    check("DMG detached", not os.path.ismount(mountpoint))


def prepare_copy_target(target):
    target.parent.mkdir(parents=True, exist_ok=True)
    check("copy target does not already exist", not target.exists() and not target.is_symlink())


def copy_from_dmg(dmg, mountpoint, target):
    attach(dmg, mountpoint)
    try:
        check("volume holds only the app and an Applications link", volume_is_clean({entry.name for entry in mountpoint.iterdir()}))
        link = mountpoint / "Applications"
        check("Applications link points to /Applications", link.is_symlink() and os.readlink(link) == "/Applications")
        prepare_copy_target(target)
        # ditto 保留符号链接、扩展属性和签名；这就是用户把 .app 拖出 DMG 时得到的东西。
        subprocess.run(["/usr/bin/ditto", str(mountpoint / (PRODUCT + ".app")), str(target)], check=True)
    finally:
        detach(mountpoint)


def static_checks(app, arch, semver, engine):
    check("app signature verifies (codesign --verify --deep --strict)",
          run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(app)]).returncode == 0)
    app_sig = run(["/usr/bin/codesign", "-dv", str(app)]).stderr
    check("app is ad-hoc signed as " + APP_ID, "Signature=adhoc" in app_sig and ("Identifier=" + APP_ID + "\n") in app_sig)
    packed = app / ENGINE_IN_APP
    engine_sig = run(["/usr/bin/codesign", "-dv", str(packed)]).stderr
    check("engine is ad-hoc signed as " + ENGINE_ID, "Signature=adhoc" in engine_sig and ("Identifier=" + ENGINE_ID + "\n") in engine_sig)
    plist = app / "Contents" / "Info.plist"
    check("Info.plist bundle id", plist_value(plist, "CFBundleIdentifier") == APP_ID)
    check("Info.plist executable", plist_value(plist, "CFBundleExecutable") == PRODUCT)
    check("Info.plist versions equal " + semver, plist_value(plist, "CFBundleShortVersionString") == semver
          and plist_value(plist, "CFBundleVersion") == semver)
    check("Info.plist explains local network access", bool(plist_value(plist, "NSLocalNetworkUsageDescription")))
    minimum, engine_minos = plist_value(plist, "LSMinimumSystemVersion"), minos(packed)
    check("LSMinimumSystemVersion %s is not below the engine minos %s" % (minimum, engine_minos),
          bool(minimum and engine_minos) and macos_version_at_least(minimum, engine_minos))
    for binary in (app / "Contents" / "MacOS" / PRODUCT, packed):
        check("%s is a single-arch %s Mach-O" % (binary.name, MACHO_ARCH[arch]),
              run(["/usr/bin/lipo", "-archs", str(binary)]).stdout.split() == [MACHO_ARCH[arch]])
    check("packaged engine matches dist/%s byte for byte" % engine.name, packed.read_bytes() == engine.read_bytes())
    resources = app / "Contents" / "Resources"
    stray = [path for path in resources.rglob("*") if path.is_file()
             and (path.name.startswith("szudesktop-engine") or path.name.startswith("szudesktop-darwin") or is_macho(path))]
    check("Resources holds no engine or other executable code", not stray)
    framework = app / "Contents" / "Frameworks" / "Electron Framework.framework" / "Resources"
    for where in (resources, framework):
        check("only en and zh_CN language resources in " + where.relative_to(app).as_posix(),
              sorted(path.name for path in where.glob("*.lproj")) == LOCALES)
    check("menu bar template images packaged", all((resources / name).is_file() for name in TRAY_TEMPLATES))
    licenses = subprocess.run([sys.executable, str(ROOT / "desktop" / "check_licenses.py"), "--electron", str(app)])
    check("license files inside the .app (check_licenses.py)", licenses.returncode == 0)


def pids_matching(marker):
    r = run(["/usr/bin/pgrep", "-f", marker])
    return [int(pid) for pid in r.stdout.split() if int(pid) != os.getpid()]


def wait_no_process(marker, timeout=10):
    """主进程退出后，Helper 进程可能还要一小会儿才结束。"""
    deadline = time.monotonic() + timeout
    while pids_matching(marker) and time.monotonic() < deadline:
        time.sleep(.2)
    return not pids_matching(marker)


def wait_gone(pid, marker, timeout=15):
    """进程号会被回收：只要这个号上已不是带本次临时目录的进程，就算已经退出。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        command = run(["/bin/ps", "-o", "command=", "-p", str(pid)])
        if command.returncode != 0 or marker not in command.stdout:
            return True
        time.sleep(.2)
    return False


def stop_group(proc):
    """.app 以 start_new_session 启动，进程组号就是它的进程号：连同 Helper 一起结束。"""
    if proc.poll() is not None:
        return
    for sig, wait in ((signal.SIGTERM, 10), (signal.SIGKILL, 10)):
        try:
            os.killpg(proc.pid, sig)
        except ProcessLookupError:
            return
        try:
            proc.wait(timeout=wait)
            return
        except subprocess.TimeoutExpired:
            pass


def redact(path):
    text = path.read_text(encoding="utf-8", errors="replace")
    cleaned = TOKEN_HEX.sub("<redacted>", text)
    if cleaned != text:
        path.write_text(cleaned, encoding="utf-8")


class Smoke:
    def __init__(self, args, root, evidence, version, semver):
        self.arch, self.local, self.root, self.evidence = args.arch, args.local, root, evidence
        self.marker = root.name
        self.version, self.semver = version, semver
        self.runtime = json.loads((HERE / "package-lock.json").read_text(encoding="utf-8"))["packages"]["node_modules/electron"]["version"]
        self.companions = default_companions()
        self.cfg = root / "独立 配置"
        self.app = root / "应用 副本" / (PRODUCT + ".app")
        self.engine = ROOT / "dist" / ("szudesktop-darwin-" + GO_ARCH[args.arch])
        self.running = []
        self.upgrade_data = None
        # Rosetta 转译下界面往返明显变慢（CI 上一次首开冒烟就要约 2 分钟），宠物菜单存档偶尔超过 6 秒；
        # 只放宽这一种情况的等待，原生运行和 Windows 冒烟仍按原来的时限。
        self.wait_scale = "4" if args.arch == "x64" and smoke_macos.native_arch() == "arm64" else None

    def env(self, report, shot, quit_after, trace):
        env = {key: value for key, value in os.environ.items()
               if key not in ("ELECTRON_RUN_AS_NODE", "SZU_SHOT", "SZU_PET_SHOT") and not key.startswith("SZU_SMOKE_")}
        env.update(SZUNET_CONFIG_DIR=str(self.cfg), SZU_SMOKE_REPORT=str(report), SZU_SMOKE_SCREENSHOT=str(shot))
        if quit_after:
            env["SZU_SMOKE_QUIT_AFTER_REPORT"] = "1"
        if trace:
            env["SZU_SMOKE_QUIT_TRACE"] = str(trace)
        if self.wait_scale:
            env["SZU_SMOKE_WAIT_SCALE"] = self.wait_scale
        return env

    def start(self, label, quit_after=True, trace=None):
        report, shot = self.evidence / (label + ".json"), self.evidence / (label + ".png")
        report.unlink(missing_ok=True)
        shot.unlink(missing_ok=True)
        log = (self.evidence / (label + ".log")).open("wb")
        proc = subprocess.Popen([str(self.app / "Contents" / "MacOS" / PRODUCT)], env=self.env(report, shot, quit_after, trace),
                                stdout=log, stderr=log, stdin=subprocess.DEVNULL, start_new_session=True)
        self.running.append(proc)
        log.close()
        # 一次启动要走完宠物、伙伴切换、备份恢复等整套界面冒烟；真卡死仍会超时报错。
        # Rosetta 下整套首开冒烟在 CI 上就要 180 秒上下（原生约 20 秒），总时限随等待倍数一起放宽。
        deadline = time.monotonic() + (540 if self.wait_scale else 180)
        while not report.exists() and time.monotonic() < deadline:
            if proc.poll() is not None:
                raise RuntimeError(label + ": app exited (%s) before its rendered-page report" % proc.returncode)
            time.sleep(.2)
        check(label + ": real UI report created", report.exists())
        result = json.loads(report.read_text(encoding="utf-8"))
        if "error" in result:
            raise RuntimeError(label + ": app smoke failed: " + result["error"])
        return proc, result, shot

    def check_report(self, label, proc, result, shot, owned=True, initial_scale=1.7):
        check(label + ": Go engine version", result["version"] == self.version)
        check(label + ": app metadata version", result["packageVersion"] == self.semver)
        check(label + ": supported Electron runtime packaged", result["electron"] == self.runtime)
        check(label + ": actual main process", result["appPid"] == proc.pid)
        check(label + ": platform and architecture", result.get("platform") == "darwin" and result.get("arch") == self.arch)
        check(label + ": real garden rendered", result["rendered"] is True and bool(result["title"]))
        check(label + ": loopback UI", re.fullmatch(r"http://127\.0\.0\.1:\d+/?", result["baseUrl"]) is not None)
        check(label + ": screenshot captured", shot.is_file() and shot.stat().st_size > 1000)
        check(label + ": engine ownership", result["owned"] is owned)
        pet = result["pet"]
        check(label + ": real pet and menu bar icon", pet["rendered"] and pet["tray"])
        check(label + ": main closes and reopens", pet["closeAndReopen"])
        check(label + ": pet visibility and actions", pet["hideAndShow"] and pet["actionsReturnToBase"])
        check(label + ": scale through settings and menu bar", pet["settingsAndPresets"] and pet["finalScale"] == 1.7)
        check(label + ": scale survives restart", pet["initialScale"] == initial_scale)
        check(label + ": catalog companion selection", pet.get("petSelection") is True and pet.get("petSelectionSync") is True)
        check(label + ": packaged roster matches source catalog", pet.get("defaultCompanions") == self.companions)
        check(label + ": both penguins render and switch", pet.get("penguinSelection") is True
              and all(species in pet.get("companionSpecies", []) for species in ("pingu", "skipper")))
        check(label + ": backup export and restore", pet.get("backupRestore") is True)
        if self.version != mac_upgrade.BASELINE_VERSION:
            check(label + ": notebook reload and real storage failure recovery",
                  pet.get("notebookReload") is True and pet.get("notebookSaveFailure") is True)
        check(label + ": transparent pet area clicks through", pet.get("clickThrough") is True)
        mac, failures = result.get("mac") or {}, result.get("macFailures") or {}
        for name, why in failures.items():
            print("   mac.%s: %s" % (name, why), flush=True)
        check(label + ": macOS runtime checks all true (%d)" % len(mac), bool(mac) and all(value is True for value in mac.values()))

    def finish(self, label, proc, result):
        check(label + ": normal window exit", proc.wait(timeout=25) == 0)
        if result["owned"]:
            check(label + ": owned engine exits with the app", wait_gone(result["sidecarPid"], self.marker))
        check(label + ": no app or engine process left", wait_no_process(self.marker))
        redact(self.evidence / (label + ".log"))

    def launch(self, label, owned=True, initial_scale=1.7):
        proc, result, shot = self.start(label)
        self.check_report(label, proc, result, shot, owned, initial_scale)
        self.finish(label, proc, result)
        return result

    def quit_event(self, runner):
        """退出前的保存握手要经得起真实的 quit Apple Event：⌘Q、程序坞退出、注销时系统发来的都是它。"""
        label = "quit-event"
        trace = self.evidence / "quit-trace.jsonl"
        trace.unlink(missing_ok=True)
        proc, result, shot = self.start(label, quit_after=False, trace=trace)
        self.check_report(label, proc, result, shot)
        sent = run(["/usr/bin/osascript", "-l", "JavaScript", "-e", QUIT_SCRIPT, str(proc.pid)], timeout=60)
        answer = sent.stdout.strip()
        print("   osascript: %s %s" % (answer or "-", sent.stderr.strip()), flush=True)
        if "-1743" in sent.stderr or answer == "refused":
            if runner and not self.local:
                print("::warning::quit Apple Event 被系统拒绝（%s），这台 runner 上跳过真实退出事件的核对"
                      % (sent.stderr.strip() or answer), flush=True)
                stop_group(proc)
                wait_gone(result["sidecarPid"], self.marker)
                return "skipped (not permitted)"
            raise AssertionError("quit Apple Event was not permitted: " + (sent.stderr.strip() or answer))
        check("quit Apple Event delivered", sent.returncode == 0 and answer == "sent")
        try:
            code = proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            code = None
        check("quit Apple Event: app exits 0 within 15s", code == 0)
        events = [json.loads(line) for line in trace.read_text(encoding="utf-8").splitlines() if line.strip()]
        check("quit trace: " + " → ".join(QUIT_TRACE), trace_in_order([event["event"] for event in events]))
        check("quit trace: renderer saved", any(event["event"] == "prepared" and event.get("ok") is True for event in events)
              and any(event["event"] == "confirmed" and event.get("saved") is True for event in events))
        check("quit trace: no session-end, cancel or timeout",
              not {event["event"] for event in events} & {"session-end", "cancelled", "prepare-timeout", "prepare-send-failed"})
        check("quit Apple Event: owned engine exits", wait_gone(result["sidecarPid"], self.marker))
        check("quit Apple Event: no app or engine process left", wait_no_process(self.marker))
        redact(self.evidence / (label + ".log"))
        return "passed"

    def coexist_with_portable(self):
        """先起 dist 里的引擎（便携用法）：.app 复用它，退出时不结束别人启动的引擎。"""
        log = (self.evidence / "portable-engine.log").open("wb")
        env = dict(os.environ, SZUNET_CONFIG_DIR=str(self.cfg))
        proc = subprocess.Popen([str(self.engine), "--no-open", "--no-auto-login", "--addr", "127.0.0.1:0"], env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
        found = {}

        def relay():
            # 证据会作为 CI artifact 上传：会话凭据那一行打码后再写。
            for raw in proc.stdout:
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                endpoint, session = smoke_macos.ENDPOINT_LINE.fullmatch(line), smoke_macos.SESSION_LINE.fullmatch(line)
                if endpoint:
                    found.setdefault("url", endpoint.group(2))
                if session:
                    found.setdefault("token", session.group(1))
                    line = "szuDesktop 会话: <redacted>"
                log.write((line + "\n").encode("utf-8"))
                log.flush()
        reader = threading.Thread(target=relay, daemon=True)
        reader.start()
        try:
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline and not ("url" in found and "token" in found):
                check("portable engine remains alive", proc.poll() is None)
                time.sleep(.2)
            check("portable engine announces address and token", "url" in found and "token" in found)
            result = self.launch("reuse-portable", owned=False)
            check("app reuses the pre-existing engine", result["baseUrl"].rstrip("/") == found["url"])
            parsed = urlsplit(found["url"])

            def call(method, path):
                conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=5)
                try:
                    body = b"{}" if method == "POST" else None
                    conn.request(method, path, body, headers={"X-SZU-Token": found["token"], "Content-Type": "application/json"})
                    response = conn.getresponse()
                    return response.status, response.read()
                finally:
                    conn.close()
            code, body = call("GET", "/api/health")
            check("closing the app leaves the portable engine alive", proc.poll() is None and code == 200
                  and json.loads(body)["app_version"] == self.version)
            check("portable engine shutdown request", call("POST", "/api/shutdown")[0] == 200)
            check("portable engine shuts down normally", proc.wait(timeout=10) == 0)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
            reader.join(timeout=5)
            log.close()

    def upgrade_from_baseline(self, baseline):
        check("candidate differs from pinned DMG baseline", self.version != mac_upgrade.BASELINE_VERSION)
        digest = mac_upgrade.verify_baseline(baseline, self.arch)
        check_dmg(baseline)
        copy_from_dmg(baseline, self.root / "baseline mount", self.app)
        check("baseline bundle version", plist_value(self.app / "Contents/Info.plist", "CFBundleShortVersionString") == "0.9.5")
        check("baseline signature verifies", run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(self.app)]).returncode == 0)
        candidate = (self.version, self.semver, self.runtime)
        try:
            self.version, self.semver, self.runtime = mac_upgrade.BASELINE_VERSION, "0.9.5", mac_upgrade.BASELINE_ELECTRON
            self.launch("baseline-open", initial_scale=1)
        finally:
            self.version, self.semver, self.runtime = candidate
        with mac_upgrade.engine_probe(self.app / ENGINE_IN_APP, self.cfg, mac_upgrade.BASELINE_VERSION,
                                      self.evidence / "baseline-data.log", smoke_macos, stop_group) as engine:
            self.upgrade_data = mac_upgrade.seed(engine)
        files = [self.cfg / "workspace-v1.json", self.cfg / "notebook-v1.json",
                 self.cfg / "electron-profile/pet-settings.json", self.cfg / "electron-profile/desktop-settings.json"]
        check("baseline data files exist", all(file.is_file() for file in files))
        before = {file: file.read_bytes() for file in files}
        check("baseline processes exited before replacement", wait_no_process(self.marker))
        unregister_all(self.marker)
        check("upgrade target is confined to this isolated smoke", self.app.resolve().is_relative_to(self.root.resolve()))
        shutil.rmtree(self.app)
        return digest, before

    def verify_upgrade(self, before, write=False):
        if before is not None:
            check("replacing app keeps all baseline data byte for byte", all(file.read_bytes() == data for file, data in before.items()))
        with mac_upgrade.engine_probe(self.app / ENGINE_IN_APP, self.cfg, self.version,
                                      self.evidence / ("upgrade-write.log" if write else "upgrade-reopen-data.log"),
                                      smoke_macos, stop_group) as engine:
            mac_upgrade.verify_data(engine, self.upgrade_data,
                                    lambda: mac_upgrade.read_synthetic_credential(self.cfg, self.root), write=write)
        check("upgrade preserves old data and synthetic credential; candidate read/write succeeds", True)

    def uninstall(self):
        """用户卸载就是把 .app 拖进废纸篓：工作区与宠物设置在配置目录里，必须原封不动。"""
        data = [self.cfg / "workspace-v1.json", self.cfg / "electron-profile" / "pet-settings.json"]
        check("workspace and pet settings exist before removing the app", all(path.is_file() for path in data))
        saved = {path: path.read_bytes() for path in data}
        # 删之前从 LaunchServices 注销（包括它里面的 Helper）：路径不在了就注销不掉。
        unregister_all(self.marker)
        # 只删本次临时目录里复制出来的那一份，绝不碰「应用程序」或别处的 szuDesktop。
        runner_temp = os.environ.get("RUNNER_TEMP")
        allowed = self.app.resolve().is_relative_to(self.root.resolve()) and (
            not runner_temp or self.root.resolve().is_relative_to(Path(runner_temp).resolve()))
        check("app to remove lies inside this smoke's temp directory", allowed)
        shutil.rmtree(self.app)
        check("removing the app keeps workspace and pet settings byte for byte",
              all(path.read_bytes() == data_bytes for path, data_bytes in saved.items()))

    def cleanup(self):
        for proc in self.running:
            stop_group(proc)
        left = pids_matching(self.marker)
        for pid in left:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        return left


def registered(marker):
    """LaunchServices 里路径含 marker 的条目（运行过的 .app 与其中的 Helper 都会被登记）。"""
    dump = run([LSREGISTER, "-dump"]).stdout
    return sorted({line.split(":", 1)[1].strip().rsplit(" (0x", 1)[0] for line in dump.splitlines()
                   if line.startswith("path:") and marker in line})


def unregister_all(marker):
    for path in registered(marker):
        if os.path.exists(path):
            run([LSREGISTER, "-u", path])


class LocalState:
    """--local：动 com.szudesktop.app 偏好前先 defaults export 备份，结束后原样还原；删掉本次新建的 ~/Library 条目。"""

    def __init__(self, root):
        self.backup = root / "com.szudesktop.app-backup.plist"
        self.prefs = run(["/usr/bin/defaults", "read", APP_ID]).returncode == 0
        self.plist = Path.home() / "Library" / "Preferences" / (APP_ID + ".plist")
        self.plist_existed = self.plist.exists()
        if self.prefs:
            check("app preferences backed up (defaults export)",
                  run(["/usr/bin/defaults", "export", APP_ID, str(self.backup)]).returncode == 0)
        self.library = self.library_entries()
        # 应用不用 safeStorage、也没开 Cookie 加密：Chromium 不该在钥匙串里建「szuDesktop Safe Storage」。
        self.safe_storage = self.has_safe_storage()
        self.real = {service: smoke_macos.keychain_mdat(service, service) for service in ("szunet", "szunet-session")}

    @staticmethod
    def has_safe_storage():
        return run([smoke_macos.SECURITY, "find-generic-password", "-s", PRODUCT + " Safe Storage"]).returncode == 0

    @staticmethod
    def library_entries():
        home = Path.home() / "Library"
        return {entry for name in LIBRARY_DIRS if (home / name).is_dir() for entry in (home / name).iterdir()
                if entry.name.lower().startswith(("com.szudesktop.app", "szudesktop"))}

    def restore(self):
        now = run(["/usr/bin/defaults", "read", APP_ID]).returncode == 0
        if self.prefs:
            # 先清空再导入：import 之后的内容与备份完全一致，不残留本次冒烟写下的键。
            run(["/usr/bin/defaults", "delete", APP_ID])
            run(["/usr/bin/defaults", "import", APP_ID, str(self.backup)])
        elif now:
            run(["/usr/bin/defaults", "delete", APP_ID])
        # defaults delete 之后 cfprefsd 会留下一个空的 plist 文件；本来没有它，而它已经是空的，就一并删掉，
        # 回到跑之前的样子（有内容时绝不直接删文件，那会和 cfprefsd 的缓存打架）。
        if not self.plist_existed and self.plist.is_file():
            with open(self.plist, "rb") as f:
                empty = plistlib.load(f) == {}
            if empty:
                self.plist.unlink()
        for entry in sorted(self.library_entries() - self.library):
            print("   清理本次新建的 %s" % entry, flush=True)
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(entry)
            else:
                entry.unlink()

    def verify(self):
        if self.prefs:
            current = plistlib.loads(subprocess.check_output(["/usr/bin/defaults", "export", APP_ID, "-"]))
            check("app preferences restored", current == plistlib.loads(self.backup.read_bytes()))
        else:
            check("app preferences domain still absent", run(["/usr/bin/defaults", "read", APP_ID]).returncode != 0
                  and (self.plist_existed or not self.plist.exists()))
        check("no new szuDesktop entries left under ~/Library", self.library_entries() == self.library)
        check("no 'szuDesktop Safe Storage' keychain item created", self.safe_storage or not self.has_safe_storage())
        check("real szunet / szunet-session items unchanged (mdat)",
              {service: smoke_macos.keychain_mdat(service, service) for service in ("szunet", "szunet-session")} == self.real)


def main():
    parser = argparse.ArgumentParser(description="macOS DMG 安装版冒烟（隔离配置、只结束自己启动的进程）")
    parser.add_argument("--arch", choices=sorted(GO_ARCH), required=True)
    parser.add_argument("--local", action="store_true",
                        help="在开发机上运行：会启动真实窗口，结束时还原 com.szudesktop.app 偏好并从 LaunchServices 注销临时副本")
    parser.add_argument("--dmg", type=Path, help="默认 desktop/electron/release/szuDesktop-<版本>-mac-<arch>.dmg")
    parser.add_argument("--baseline-dmg", type=Path, help="fixed published beta0.9.5 DMG; runner requires the prepared baseline")
    args = parser.parse_args()
    runner = os.environ.get("GITHUB_ACTIONS") == "true" and bool(os.environ.get("RUNNER_TEMP"))
    if sys.platform != "darwin":
        raise SystemExit("smoke_dmg.py 只能在 macOS 上运行")
    if not runner and not args.local:
        raise SystemExit("smoke_dmg.py 默认只在一次性的 GitHub macOS runner 上运行；开发机上请显式加 --local。什么都没做。")
    native = smoke_macos.native_arch()
    if args.arch == "arm64" and native != "arm64":
        raise SystemExit("Intel Mac 不能运行 arm64 安装包")
    if args.arch == "x64" and native == "arm64" and run(["/usr/bin/arch", "-x86_64", "/usr/bin/true"]).returncode != 0:
        raise SystemExit("本机不能运行 x64 安装包：Apple 芯片上要先装 Rosetta")
    version, semver = version_info()
    baseline_dir = os.environ.get("SZU_DMG_BASELINE_DIR")
    baseline = args.baseline_dmg or (Path(baseline_dir) / mac_upgrade.baseline_name(args.arch) if baseline_dir else None)
    if runner and baseline is None:
        raise SystemExit("Runner requires a pinned DMG upgrade baseline; prepare mac_upgrade.py first")
    if baseline is not None:
        baseline = baseline.resolve()
        mac_upgrade.verify_baseline(baseline, args.arch)
    dmg = (args.dmg or HERE / "release" / ("szuDesktop-%s-mac-%s.dmg" % (semver, args.arch))).resolve()
    evidence = HERE / "release" / ("smoke-evidence-mac-" + args.arch)
    if evidence.exists():
        shutil.rmtree(evidence)
    evidence.mkdir(parents=True)
    summary = {"arch": args.arch, "dmg": dmg.name}
    base = os.environ["RUNNER_TEMP"] if runner else None
    # 目录名带 smoke：收尾时按它在 LaunchServices 与进程列表里找本次留下的东西。
    with tempfile.TemporaryDirectory(prefix="szu-dmg-smoke-", dir=base) as tmp:
        root = Path(tmp)
        local = LocalState(root) if args.local else None
        smoke = None
        failure = None
        try:
            summary["dmg_sha256"] = check_dmg(dmg)
            smoke = Smoke(args, root, evidence, version, semver)
            smoke.cfg.mkdir(mode=0o700)
            preserved = None
            if baseline is not None:
                baseline_digest, preserved = smoke.upgrade_from_baseline(baseline)
                summary.update(upgrade_from=mac_upgrade.BASELINE_VERSION, baseline_sha256=baseline_digest)
            copy_from_dmg(dmg, root / "挂载 点", smoke.app)
            static_checks(smoke.app, args.arch, smoke.semver, smoke.engine)
            if baseline is not None:
                smoke.verify_upgrade(preserved, write=True)
            first = smoke.launch("first-open", initial_scale=1.7 if baseline is not None else 1)
            smoke.launch("reopen")
            summary["quit_apple_event"] = smoke.quit_event(runner)
            smoke.coexist_with_portable()
            if baseline is not None:
                smoke.verify_upgrade(None)
                summary.update(cross_version_upgrade_preserved_data=True, candidate_read_write=True, synthetic_credential_decrypts=True)
            smoke.uninstall()
            summary.update(version=smoke.version, electron=first["electron"], mac=first["mac"],
                           click_through=first["pet"]["clickThrough"], companion_species=first["pet"]["companionSpecies"])
        except BaseException as error:
            failure = error
            raise
        finally:
            left = smoke.cleanup() if smoke else []
            unregister_all(root.name)
            if smoke:
                # 引擎在设置了 SZUNET_CONFIG_DIR 时用带本次哈希的服务名；冒烟不存账号，万一建了也在这里删掉。
                suffix = smoke_macos.keychain_suffix(smoke.cfg)
                for service, account in (("szunet-test-" + suffix, "szunet"), ("szunet-session-test-" + suffix, "szunet-session")):
                    smoke_macos.delete_keychain_item(service, account)
            if local:
                local.restore()
            if smoke:
                for path in evidence.iterdir():
                    if path.suffix in (".log", ".json", ".jsonl"):
                        redact(path)
            if failure is None:
                check("no processes left from this smoke", not left)
                check("copied app unregistered from LaunchServices", not registered(root.name))
                if local:
                    local.verify()
                check("no -test- keychain items left for this config", all(
                    smoke_macos.keychain_attributes(service, account) is None for service, account in (
                        ("szunet-test-" + smoke_macos.keychain_suffix(smoke.cfg), "szunet"),
                        ("szunet-session-test-" + smoke_macos.keychain_suffix(smoke.cfg), "szunet-session"))))
    (evidence / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("ALL DMG SMOKE CHECKS PASSED", flush=True)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    main()
