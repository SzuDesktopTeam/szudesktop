"""macOS 引擎冒烟：在隔离的配置目录里真跑 dist/szudesktop-darwin-<arch>，不用真实账号、不做真实认证。

用法:
    python desktop/smoke_macos.py --arch arm64           # 一次性的 GitHub macOS runner 上
    python3 desktop/smoke_macos.py --arch amd64 --local  # 开发机上必须显式加 --local（Apple 芯片上经 Rosetta 执行）

与 smoke_windows.py 同一套和平台无关的 HTTP 检查：协议两行、复用实例、本次运行的凭据（401 / 403）、
launch 换 Cookie、工作区跨进程与端口保留、/api/shutdown 与关掉最后一个窗口后的优雅退出。
另外核对只有 macOS 才有的部分：
- 静态：lipo 单一架构、ad-hoc 签名（com.szudesktop.engine）、.sha256、自报版本、最低系统版本不高于应用承诺的 13.0。
- 会话信封：2KB 的 Cookie 保存后，钥匙串条目里只有 64 位十六进制密钥，密文在 session.enc（0600）。
- SIGTERM 在 2 秒内以 0 退出并删掉 desktop-instance.json；按 launchd 的默认 PATH 运行时开机自启报「不支持」。

钥匙串是整个用户共用的，隔离靠桌面引擎的命名规则：设置了 SZUNET_CONFIG_DIR 时服务名带
-test-<配置目录哈希>（internal/credential/keychain_namespace.go）。这里按同一规则算出名字，结束时只删这两个条目，
并核对真实 szunet / szunet-session 条目的修改时间（mdat）没变。开发机上跑会在本机钥匙串里短暂建这两个带
-test- 的条目，所以没有 --local 时直接拒绝运行。
"""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
ENGINE_ID = "com.szudesktop.engine"
LIPO = {"arm64": "arm64", "amd64": "x86_64"}
# 应用在 Info.plist 里承诺的最低系统版本（Electron 44 的 LSMinimumSystemVersion），引擎不能比它要求更高。
APP_MIN_MACOS = (13, 0)
# 从 Finder、程序坞或登录项启动时，launchd 只给这几个目录。
LAUNCHD_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"
# ps 的进程标志里 P_TRANSLATED（sys/proc.h）：进程正经 Rosetta 转译执行。
P_TRANSLATED = 0x20000
SECURITY = "/usr/bin/security"

ENDPOINT_LINE = re.compile(r"szuDesktop (已启动|已复用): (http://127\.0\.0\.1:\d+)\r?")
SESSION_LINE = re.compile(r"szuDesktop 会话: ([0-9a-f]{64})\r?")


def check(name, ok):
    if not ok:
        raise AssertionError(name)
    print("PASS", name, flush=True)


def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def keychain_suffix(config_dir):
    """与 keychain_namespace.go 相同：sha256(Clean(Abs(dir))) 的前 12 位；不解析符号链接。

    必须用传给引擎的那个字符串来算：macOS 上 /var 与 /private/var 会得到不同的名字。
    """
    return hashlib.sha256(os.path.normpath(os.path.abspath(config_dir)).encode("utf-8")).hexdigest()[:12]


# Go 侧的已知答案测试锁着同一个值（keychain_namespace_test.go）；两边的规则一旦走偏，清理就会找错条目。
assert keychain_suffix("/tmp/szu-cfg/") == "45c72b5fda1d", "钥匙串后缀的算法与 Go 侧不一致"


def keychain_attributes(service, account):
    """条目的属性文本（含 mdat）；不存在返回 None。只读属性，不读密码，不会弹授权框。"""
    r = run([SECURITY, "find-generic-password", "-s", service, "-a", account])
    if r.returncode == 44:
        return None
    if r.returncode != 0:
        raise RuntimeError("读不出钥匙串条目 %s：%s" % (service, r.stderr.strip()))
    return r.stdout


def keychain_mdat(service, account):
    attributes = keychain_attributes(service, account)
    if attributes is None:
        return None
    found = re.search(r'"mdat"<timedate>=(.*)', attributes)
    return found.group(1).strip() if found else attributes


def keychain_count(pattern):
    """默认钥匙串里服务名匹配 pattern 的条目数（dump-keychain 只列属性，不解密）。"""
    r = run([SECURITY, "dump-keychain"])
    return len(re.findall(r'"svce"<blob>="' + pattern, r.stdout))


def delete_keychain_item(service, account):
    run([SECURITY, "delete-generic-password", "-s", service, "-a", account])


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def native_arch():
    # 不看 platform.machine()：Rosetta 下运行的 Python 会报 x86_64。
    r = run(["/usr/sbin/sysctl", "-n", "hw.optional.arm64"])
    return "arm64" if r.returncode == 0 and r.stdout.strip() == "1" else "amd64"


def process_flags(pid):
    r = run(["/bin/ps", "-o", "flags=", "-p", str(pid)])
    return int(r.stdout.strip(), 16) if r.returncode == 0 and r.stdout.strip() else None


class Announcement:
    """读引擎标准输出里的协议两行；读完继续排空管道，免得管道写满把 Go 卡住。"""

    def __init__(self, proc):
        self.url = self.token = self.verb = None
        self.ready = threading.Event()
        threading.Thread(target=self._read, args=(proc.stdout,), daemon=True).start()

    def _read(self, stream):
        for raw in stream:
            line = raw.decode("utf-8", "replace").rstrip("\n")
            endpoint, session = ENDPOINT_LINE.fullmatch(line), SESSION_LINE.fullmatch(line)
            if endpoint and not self.url:
                self.verb, self.url = endpoint.group(1), endpoint.group(2)
            if session and not self.token:
                self.token = session.group(1)
            if self.url and self.token:
                self.ready.set()

    def wait(self, timeout=20):
        if not self.ready.wait(timeout):
            raise RuntimeError("engine did not announce its address and session token")
        return self


class Engine:
    """本脚本自己启动、只属于这次冒烟的引擎。只结束自己持有的这个进程。"""

    def __init__(self, exe, cfg, env=None, port=None):
        self.port = port or free_port()
        self.base = "http://127.0.0.1:%d" % self.port
        env = dict(env if env is not None else os.environ, SZUNET_CONFIG_DIR=str(cfg))
        self.proc = subprocess.Popen([str(exe), "--no-open", "--no-auto-login", "--addr", "127.0.0.1:%d" % self.port],
                                     env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        try:
            self.announced = Announcement(self.proc).wait()
            self.token = self.announced.token
            for _ in range(40):
                if self.proc.poll() is not None:
                    raise RuntimeError("engine exited during startup")
                try:
                    if self.request("/api/health", auth=False)[0] == 200:
                        break
                except OSError:
                    pass
                time.sleep(.25)
            else:
                raise RuntimeError("engine did not start serving")
        except BaseException:
            # 还没交给调用方就失败了：这个进程只有这里知道，不能留在后台。
            self.stop()
            raise

    # 直连本机：不走系统代理，也不在服务端拒收请求体时提前 Connection: close。
    def request(self, path, data=None, method=None, headers=None, auth=True):
        h = {"Content-Type": "application/json"} if data is not None else {}
        if auth and self.token:
            h["X-SZU-Token"] = self.token
        h.update(headers or {})
        body = json.dumps(data).encode() if data is not None else None
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=45)
        try:
            conn.request(method or ("POST" if data is not None else "GET"), path, body, headers=h)
            response = conn.getresponse()
            return response.status, response.read(), response.headers
        finally:
            conn.close()

    def get(self, path):
        code, body, _ = self.request(path)
        assert code == 200, (path, code, body)
        return json.loads(body)

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)


def static_checks(exe, arch, version):
    check("engine built: " + str(exe.relative_to(ROOT)), exe.is_file() and os.access(exe, os.X_OK))
    check("engine is a single-arch %s Mach-O" % LIPO[arch], run(["/usr/bin/lipo", "-archs", str(exe)]).stdout.split() == [LIPO[arch]])
    check("engine signature verifies (codesign --verify --strict)", run(["/usr/bin/codesign", "--verify", "--strict", str(exe)]).returncode == 0)
    info = run(["/usr/bin/codesign", "-dv", str(exe)]).stderr
    check("engine is ad-hoc signed as " + ENGINE_ID, "Signature=adhoc" in info and ("Identifier=" + ENGINE_ID + "\n") in info)
    digest = hashlib.sha256(exe.read_bytes()).hexdigest()
    sums = Path(str(exe) + ".sha256")
    check("engine .sha256 matches (ASCII, LF, two spaces, repo-root path)", sums.is_file()
          and sums.read_bytes() == ("%s  dist/%s\n" % (digest, exe.name)).encode("ascii"))
    out = run([str(exe), "--version"], timeout=60)
    check("engine reports the version from internal/version/VERSION", out.returncode == 0 and version in out.stdout)
    build = run(["/usr/bin/vtool", "-show-build", str(exe)])
    minos = re.search(r"^\s*minos\s+(\d+)\.(\d+)", build.stdout, re.M)
    check("engine minos readable (vtool)", minos is not None)
    check("engine minos %s.%s is not above the app's macOS 13.0" % minos.groups(),
          tuple(map(int, minos.groups())) <= APP_MIN_MACOS)
    return digest


def assert_translation(proc, arch):
    """Apple 芯片上的 amd64 引擎必须真的经 Rosetta 执行；原生架构不能被转译。"""
    flags = process_flags(proc.pid)
    if flags is None:
        return
    translated = bool(flags & P_TRANSLATED)
    if arch == "amd64" and native_arch() == "arm64":
        check("amd64 engine runs under Rosetta", translated)
    else:
        check("engine runs natively", not translated)


def http_checks(engine, cfg, exe, env):
    """与 smoke_windows.py 相同的、和平台无关的接口检查（第一次启动）。"""
    check("engine announces its address and a session token", engine.announced.verb == "已启动" and engine.announced.url == engine.base)
    duplicate = subprocess.Popen([str(exe), "--no-open", "--no-auto-login"], env=dict(env, SZUNET_CONFIG_DIR=str(cfg)),
                                 stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    try:
        out, _ = duplicate.communicate(timeout=15)
        check("duplicate launch reuses instance", duplicate.returncode == 0 and engine.proc.poll() is None)
        check("duplicate launch hands over the same address and token", out.decode("utf-8", "replace").splitlines()
              == ["szuDesktop 已复用: " + engine.base, "szuDesktop 会话: " + engine.token])
    finally:
        if duplicate.poll() is None:
            duplicate.kill()
            duplicate.wait()
    token = engine.token
    request, get = engine.request, engine.get
    check("instance rejects wrong token", request("/api/instance", {"token": "wrong", "open": False}, auth=False)[0] == 403)
    code, body, _ = request("/api/status", auth=False)
    check("API rejects callers without the session token", code == 401 and token.encode() not in body and json.loads(body)["ok"] is False)
    check("API rejects a wrong session token", request("/api/credential", headers={"X-SZU-Token": "0" * 64})[0] == 401)
    check("API rejects the token in a query string", request("/api/status?launch=" + token, auth=False)[0] == 401)
    check("health needs no session token", request("/api/health", auth=False)[0] == 200)
    code, _, headers = request("/?launch=" + token, auth=False)
    cookie = headers.get("Set-Cookie") or ""
    check("launch URL trades the token for a session cookie", code == 303 and headers.get("Location") == "/"
          and cookie.startswith("szu_session=%s;" % token) and all(part in cookie for part in ("Path=/", "HttpOnly", "SameSite=Strict")))
    check("session cookie authorizes the page", request("/api/status", auth=False, headers={"Cookie": "szu_session=" + token})[0] == 200)
    code, _, headers = request("/?launch=" + "0" * 64, auth=False)
    check("wrong launch token gets no cookie", code == 200 and headers.get("Set-Cookie") is None)
    check("cross-origin request rejected even with the token", request("/api/credential", headers={"Origin": "https://example.com"})[0] == 403)
    check("window API rejects cross origin", request("/api/window", {"id": "smoke-window-primary"}, headers={"Origin": "https://example.com"})[0] == 403)
    check("window heartbeat accepted", request("/api/window", {"id": "smoke-window-primary"})[0] == 200)
    check("second window heartbeat accepted", request("/api/window", {"id": "smoke-window-second"})[0] == 200)
    check("second window close accepted", request("/api/window", {"id": "smoke-window-second", "closing": True})[0] == 200)
    for name in ["/api/status", "/api/diag", "/api/credential", "/api/vpn/status", "/api/campus/status"]:
        check(name, isinstance(get(name), dict))
    check("notice source is allowlisted", request("/api/campus/notices?source=https://example.com")[0] == 400)
    check("notices reject cross origin", request("/api/campus/notices?source=undergrad", headers={"Origin": "https://example.com"})[0] == 403)
    check("notices reject POST", request("/api/campus/notices?source=undergrad", {})[0] == 405)
    check("bundled official calendar available offline", get("/api/campus/calendar")["terms"][0]["week_start"] == "2026-08-30")
    check("calendar rejects cross origin", request("/api/campus/calendar", headers={"Origin": "https://example.com"})[0] == 403)
    check("academic login starts signed out", get("/api/academic/session")["authenticated"] is False)
    check("timetable requires academic login", request("/api/academic/timetable")[0] == 409)
    check("academic login requires complete fields", request("/api/academic/login", {})[0] == 400)
    check("default VPN unavailable", get("/api/vpn/status")["state"] == "unavailable")
    check("no account exposed in status", get("/api/status")["username"] == "")
    version = (ROOT / "internal/version/VERSION").read_text(encoding="utf-8").strip()
    check("status reports the same version as the engine", get("/api/status")["app_version"] == version)
    check("page carries no hardcoded version string", b"beta0" not in request("/")[1] and b"beta0" not in request("/assets/garden/app.mjs")[1])
    # 只读状态和拒绝路径：冒烟绝不 POST 去开关自启。
    autostart = get("/api/autostart")
    check("autostart status readable", isinstance(autostart, dict) and "detail" in autostart and "supported" in autostart)
    check("autostart rejects cross origin", request("/api/autostart", {"enabled": True}, headers={"Origin": "https://example.com"})[0] == 403)
    check("autostart rejects PUT", request("/api/autostart", method="PUT")[0] == 405)
    garden = ROOT / "desktop/assets/garden"
    for path, file in [("/", ROOT / "desktop/index.html"), ("/assets/garden/app.mjs", garden / "app.mjs"),
                       ("/assets/garden/platform.mjs", garden / "platform.mjs"), ("/assets/garden/style.css", garden / "style.css"),
                       ("/assets/garden/engine.mjs", garden / "engine.mjs"), ("/assets/garden/campus.png", garden / "campus.png"),
                       ("/assets/szudesktop.ico", ROOT / "desktop/assets/szudesktop.ico")]:
        code, body, _ = request(path)
        check("embedded " + path, code == 200 and body == file.read_bytes())
    code, css, _ = request("/assets/fonts/fusion-pixel.css")
    fonts = re.findall(r"url\(([^)]+\.woff2)\)", css.decode("utf-8")) if code == 200 else []
    check("pixel font subsets complete", bool(fonts) and all(request("/assets/fonts/" + name)[0] == 200 for name in fonts))
    check("OFL license packaged", b"SIL OPEN FONT LICENSE" in request("/assets/fonts/LICENSE-OFL.txt")[1])
    check("legacy borrowed art not packaged", request("/assets/art/m1.png")[0] == 404)
    code, body, _ = request("/api/login", {"username": "", "password": ""})
    check("empty login explains failure", code == 200 and not json.loads(body)["ok"])


def keychain_checks(engine, cfg, names):
    """账号与学校会话都走钥匙串；服务名带本次配置目录的 -test-<哈希>，真实条目一个都不碰。"""
    request, get = engine.request, engine.get
    credential_service, session_service = names
    credential = {"username": "000000", "password": "smoke-test-only-not-real"}
    check("save isolated test credential", request("/api/credential", credential)[0] == 200)
    check("credential stored under the per-config keychain name " + credential_service,
          keychain_attributes(credential_service, "szunet") is not None)
    check("saved username remains hidden", get("/api/credential")["username"] == "")
    check("explicit username reveal", get("/api/credential?reveal=1")["username"] == "000000")
    check("credential never returns password", "password" not in get("/api/credential?reveal=1"))
    check("delete isolated credential", request("/api/credential", method="DELETE")[0] == 200)
    check("credential keychain item removed", keychain_attributes(credential_service, "szunet") is None)

    check("no school session by default", get("/api/session")["saved"] is False)
    check("session rejects cross-origin write", request("/api/session", {"cookie": "test-only=1"}, headers={"Origin": "https://example.com"})[0] == 403)
    # 2KB：真实的 ehall Cookie 常在 1–2KB，远超钥匙串一次能完整写入的 128 字节。
    prefix = "session-smoke-only="
    fake_session = prefix + "x" * (2048 - len(prefix))
    check("save a 2KB isolated school session", request("/api/session", {"cookie": fake_session})[0] == 200)
    status = get("/api/session")
    check("school session saved and never echoed", status["saved"] is True and status.get("cookie_len") == 2048
          and fake_session not in json.dumps(status) and "cookie" not in status)
    key = run([SECURITY, "find-generic-password", "-s", session_service, "-a", "szunet-session", "-w"])
    check("session keychain item holds only a 64-hex key", key.returncode == 0 and re.fullmatch(r"[0-9a-f]{64}\n?", key.stdout) is not None)
    envelope = Path(cfg) / "session.enc"
    check("session.enc is 0600", envelope.is_file() and stat.S_IMODE(envelope.stat().st_mode) == 0o600)
    check("session.enc holds no plaintext cookie", b"session-smoke-only" not in envelope.read_bytes())
    check("no plaintext session file", not (Path(cfg) / "session.json").exists())
    check("delete isolated school session", request("/api/session", method="DELETE")[0] == 200)
    check("session key and session.enc both removed", keychain_attributes(session_service, "szunet-session") is None
          and not envelope.exists())
    check("school session reads as not saved after delete", get("/api/session")["saved"] is False)


def smoke(exe, arch, workdir):
    version = (ROOT / "internal/version/VERSION").read_text(encoding="utf-8").strip()
    static_checks(exe, arch, version)
    # 与 smoke_installer 一样用带中文和空格的配置目录；钥匙串后缀就按这个字符串算。
    cfg = os.path.join(workdir, "独立 配置")
    os.mkdir(cfg, 0o700)
    suffix = keychain_suffix(cfg)
    names = ("szunet-test-" + suffix, "szunet-session-test-" + suffix)
    env = {k: v for k, v in os.environ.items() if k != "SZUNET_CONFIG_DIR"}
    real = {service: keychain_mdat(service, service) for service in ("szunet", "szunet-session")}
    selftest_before = keychain_count("szunet-selftest-")
    instance = Path(cfg) / "desktop-instance.json"
    engine = None
    try:
        engine = Engine(exe, cfg, env)
        assert_translation(engine.proc, arch)
        http_checks(engine, cfg, exe, env)
        keychain_checks(engine, cfg, names)
        w = engine.get("/api/workspace")
        check("initial workspace empty", w["data"] is None)
        snapshot = {"version": 1, "revision": 0, "data": {"test": "restart"}}
        check("workspace write", engine.request("/api/workspace", snapshot)[0] == 200)
        check("stale workspace rejected", engine.request("/api/workspace", snapshot)[0] == 409)
        check("cross-origin mutation rejected", engine.request("/api/workspace", snapshot, headers={"Origin": "https://example.com"})[0] == 403)
        check("shutdown requires POST", engine.request("/api/shutdown")[0] == 405)
        check("application exit endpoint", engine.request("/api/shutdown", {})[0] == 200)
        engine.proc.wait(timeout=6)
        check("clean shutdown", engine.proc.returncode == 0 and not instance.exists())

        # 换一个随机端口重启：必须读到同一份落盘的存档，旧凭据作废。
        previous = engine.token
        engine = Engine(exe, cfg, env)
        check("every run gets a fresh session token", engine.token != previous)
        check("previous run token no longer works", engine.request("/api/workspace", headers={"X-SZU-Token": previous})[0] == 401)
        w = engine.get("/api/workspace")
        check("save survives process and port change", w["revision"] == 1 and w["data"] == {"test": "restart"})
        stream_conn = http.client.HTTPConnection("127.0.0.1", engine.port, timeout=5)
        stream_conn.request("GET", "/api/window-stream?id=smoke-window-stream", headers={"X-SZU-Token": engine.token})
        stream = stream_conn.getresponse()
        check("window stream connected", stream.status == 200 and stream.readline() == b": alive\n")
        stream.close()
        stream_conn.close()
        engine.proc.wait(timeout=16)
        check("closing last window exits the process", engine.proc.returncode == 0)

        # 从 Finder、程序坞或登录项启动时只有 launchd 的默认 PATH：引擎照常工作；
        # 开机自启在 macOS 上由 Electron 的登录项负责，引擎这边如实报「不支持」，不假装「未开启」。
        launchd_env = {k: os.environ[k] for k in ("HOME", "USER", "LOGNAME", "TMPDIR", "SHELL") if k in os.environ}
        launchd_env["PATH"] = LAUNCHD_PATH
        engine = Engine(exe, cfg, launchd_env)
        autostart = engine.get("/api/autostart")
        check("launchd PATH: autostart reports unsupported", autostart.get("supported") is False and bool(autostart.get("detail"))
              and not autostart.get("error"))
        check("launchd PATH: Feishu status readable", isinstance(engine.get("/api/feishu/status"), dict))
        check("launchd PATH: instance file written", instance.is_file())
        # 注销、关机时系统发来的 SIGTERM（或用户 kill）走与 /api/shutdown 相同的排空路径，并删掉实例文件。
        started = time.monotonic()
        engine.proc.send_signal(signal.SIGTERM)
        try:
            engine.proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass
        elapsed = time.monotonic() - started
        check("SIGTERM exits 0 within 2s (%.2fs)" % elapsed, engine.proc.returncode == 0)
        check("SIGTERM removes desktop-instance.json", not instance.exists())
    finally:
        if engine is not None:
            engine.stop()
        # 引擎正常时两处都已删掉；中途失败时在这里兜底，只删本次哈希对应的两个条目。
        for service, account in zip(names, ("szunet", "szunet-session")):
            delete_keychain_item(service, account)
    check("no -test- keychain items left for this config", all(keychain_attributes(s, a) is None
                                                               for s, a in zip(names, ("szunet", "szunet-session"))))
    check("keychain self-test items cleaned up", keychain_count("szunet-selftest-") <= selftest_before)
    check("real szunet / szunet-session items unchanged (mdat)",
          {service: keychain_mdat(service, service) for service in ("szunet", "szunet-session")} == real)


def main():
    parser = argparse.ArgumentParser(description="macOS 引擎冒烟（隔离配置目录与钥匙串条目）")
    # 默认架构等确认是 macOS 之后再问 sysctl：别的系统上先给出「只能在 macOS 上运行」，而不是找不到 sysctl 的报错。
    parser.add_argument("--arch", choices=sorted(LIPO), help="默认本机架构")
    parser.add_argument("--local", action="store_true",
                        help="在开发机上运行：会在本机钥匙串里短暂建两个带 -test- 后缀的条目，结束时删除")
    args = parser.parse_args()
    runner = os.environ.get("GITHUB_ACTIONS") == "true" and bool(os.environ.get("RUNNER_TEMP"))
    if sys.platform != "darwin":
        raise SystemExit("smoke_macos.py 只能在 macOS 上运行")
    if not runner and not args.local:
        raise SystemExit("smoke_macos.py 默认只在一次性的 GitHub macOS runner 上运行；开发机上请显式加 --local。什么都没做。")
    args.arch = args.arch or native_arch()
    exe = ROOT / "dist" / ("szudesktop-darwin-" + args.arch)
    if args.arch == "arm64" and native_arch() != "arm64":
        raise SystemExit("Intel Mac 不能执行 arm64 引擎")
    if args.arch == "amd64" and native_arch() == "arm64" and run(["/usr/bin/arch", "-x86_64", "/usr/bin/true"]).returncode != 0:
        raise SystemExit("本机不能执行 amd64 引擎：Apple 芯片上要先装 Rosetta")
    base = os.environ["RUNNER_TEMP"] if runner else None
    with tempfile.TemporaryDirectory(prefix="szu-engine-smoke-", dir=base) as workdir:
        smoke(exe, args.arch, workdir)
    print("ALL SMOKE CHECKS PASSED", flush=True)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    main()
