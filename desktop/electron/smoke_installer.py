"""Exercise the final NSIS package on a disposable GitHub Windows runner.

Never installs on a developer's desktop. Uses an isolated Chinese/space path and
profile, refuses existing installations, and only stops processes it started.
The published baseline is installed, given synthetic data, upgraded to the
candidate, opened twice, and removed. No real account or school login is used.
"""
import ctypes
from contextlib import contextmanager
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "release" / "smoke-evidence"
# electron-builder's stable NSIS UUID v5 namespace and this app's configured ID.
APP_ID = "com.szudesktop.app"
APP_GUID = str(uuid.uuid5(uuid.UUID("50e065bc-3134-11e6-9bab-38c9862bdaf3"), APP_ID))
INSTALL_KEY = "Software\\" + APP_GUID
UNINSTALL_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + APP_GUID
RUN_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
# Task Manager's enabled/disabled state for a Run entry, keyed by the same value name.
STARTUP_APPROVED_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
# Chromium locales the package keeps (electron-builder.yml electronLanguages).
EXPECTED_LOCALES = ["en-US.pak", "zh-CN.pak"]
# Keep this baseline fixed: a moving latest URL could silently test a reinstall.
# It is the latest *published* release, i.e. what existing users upgrade from.
# After publishing a release, move it forward and pin that installer's digest
# (the release page and its .sha256 asset both show it) in the same change that
# bumps internal/version/VERSION to the next version, or after that bump has
# landed: main() requires the candidate to differ from the baseline, so moving
# the baseline first fails every PR and main build.
BASELINE_VERSION = "beta0.9.2"
BASELINE_ELECTRON = "44.4.5"
BASELINE_SHA256 = "454e92d6ef8b888fac3fb15363bce62845088494300d69959fd6da89c67b64e4"
BASELINE_INSTALLER = "szuDesktop-Setup-" + re.sub(r"^(?:beta|v)", "", BASELINE_VERSION) + ".exe"
# A fresh beta0.9.2 save carries exactly these companions, in this order.
BASELINE_COMPANIONS = ["libao", "chestnut", "egret", "turtle"]


def check(label, condition):
    if not condition:
        raise AssertionError(label)
    print("PASS", label, flush=True)


def default_companions():
    """Use the source catalog, so adding a pet does not require a second roster."""
    catalog = (ROOT / "desktop" / "assets" / "garden" / "pet-catalog.mjs").as_uri()
    source = "import {AVAILABLE_PETS} from " + json.dumps(catalog) + ";console.log(JSON.stringify(AVAILABLE_PETS));"
    return json.loads(subprocess.check_output(["node", "--input-type=module", "--eval", source],
                                             text=True, encoding="utf-8"))


def reg_values(hive, key, view):
    import winreg
    try:
        with winreg.OpenKey(hive, key, 0, winreg.KEY_READ | view) as opened:
            return {winreg.EnumValue(opened, i)[0]: winreg.EnumValue(opened, i)[1]
                    for i in range(winreg.QueryInfoKey(opened)[1])}
    except FileNotFoundError:
        return {}


def installation():
    import winreg
    return reg_values(winreg.HKEY_CURRENT_USER, INSTALL_KEY, winreg.KEY_WOW64_64KEY)


def seed_autostart(exe):
    """Register launch at login the way Electron's setLoginItemSettings does.

    Smoke launches never touch the real login items, so write the values
    directly: the Run command and an enabled StartupApproved entry, both named
    after the AppUserModelId. A real uninstall must remove both (electron-7).
    """
    import winreg
    command = subprocess.list2cmdline([str(exe), "--autostart"])
    access = winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, access) as key:
        winreg.SetValueEx(key, APP_ID, 0, winreg.REG_SZ, command)
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, STARTUP_APPROVED_KEY, 0, access) as key:
        # First byte 02 means enabled in Task Manager; the rest is a timestamp.
        winreg.SetValueEx(key, APP_ID, 0, winreg.REG_BINARY, bytes([2] + [0] * 11))
    check("launch at login registered before uninstall",
          reg_values(winreg.HKEY_CURRENT_USER, RUN_KEY, winreg.KEY_WOW64_64KEY).get(APP_ID) == command
          and APP_ID in reg_values(winreg.HKEY_CURRENT_USER, STARTUP_APPROVED_KEY, winreg.KEY_WOW64_64KEY))


def remove_autostart_leftovers():
    """Return the keys that still hold our autostart value, then delete them.

    Cleanup comes first so a failing check never leaves a dead startup entry
    behind, even on a disposable runner.
    """
    import winreg
    leftovers = []
    for key in (RUN_KEY, STARTUP_APPROVED_KEY):
        if APP_ID not in reg_values(winreg.HKEY_CURRENT_USER, key, winreg.KEY_WOW64_64KEY):
            continue
        leftovers.append(key)
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0,
                                winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY) as opened:
                winreg.DeleteValue(opened, APP_ID)
        except OSError:
            pass
    return leftovers


def no_existing_installation():
    import winreg
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in (winreg.KEY_WOW64_32KEY, winreg.KEY_WOW64_64KEY):
            check("no pre-existing installation in registry", not reg_values(hive, INSTALL_KEY, view)
                  and not reg_values(hive, UNINSTALL_KEY, view))


def run_nsis(exe, final_argument):
    # NSIS explicitly requires /D= and _?= to be LAST and UNQUOTED, even with
    # spaces. Pass a raw command line directly to CreateProcess (never a shell).
    # builder 26's assisted installer (/S + oneClick:false) starts the app only
    # with --force-run. Never pass that flag: launch() supplies isolated config.
    command = subprocess.list2cmdline([str(exe), "/S", "/currentuser"])
    proc = subprocess.Popen(command + " " + final_argument,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        check("NSIS exits successfully", proc.wait(timeout=150) == 0)
    finally:
        stop_owned_tree(proc)


def stop_owned_tree(proc):
    if proc.poll() is None:
        # A Popen object that still holds the running process prevents guessing
        # by name or targeting unrelated user instances.
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                       capture_output=True, timeout=15,
                       creationflags=subprocess.CREATE_NO_WINDOW)
        proc.wait(timeout=15)


def wait_process_gone(pid, timeout=15):
    """Hold a Windows process handle so a recycled PID cannot fool the check."""
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE only
    if not handle:
        check("sidecar process is gone", ctypes.get_last_error() == 87)
        return
    try:
        check("owned sidecar exits with its window", kernel.WaitForSingleObject(handle, timeout * 1000) == 0)
    finally:
        kernel.CloseHandle(handle)


def launch(exe, cfg, version, label, owned=True, initial_scale=1.7, runtime=None):
    report = EVIDENCE / (label + ".json")
    shot = EVIDENCE / (label + ".png")
    report.unlink(missing_ok=True)
    shot.unlink(missing_ok=True)
    env = dict(os.environ, SZUNET_CONFIG_DIR=str(cfg), SZU_SMOKE_REPORT=str(report),
               SZU_SMOKE_SCREENSHOT=str(shot), SZU_SMOKE_QUIT_AFTER_REPORT="1")
    # An inherited developer diagnostic variable must not compete with smoke.
    env.pop("SZU_SHOT", None)
    with (EVIDENCE / (label + ".log")).open("wb") as log:
        proc = subprocess.Popen([str(exe)], env=env, stdout=log, stderr=log,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            deadline = time.monotonic() + 60
            while not report.exists() and time.monotonic() < deadline:
                if proc.poll() is not None:
                    raise RuntimeError("installed application exited before its rendered-page report")
                time.sleep(.1)
            check(label + ": real UI report created", report.exists())
            # main writes the report atomically before its normal quit path.
            result = json.loads(report.read_text(encoding="utf-8"))
            if "error" in result:
                raise RuntimeError("installed app smoke failed: " + result["error"])
            check(label + ": Go engine version", result["version"] == version)
            check(label + ": installer metadata version", result["packageVersion"] == re.sub(r"^(?:beta|v)", "", version))
            expected_runtime = runtime or json.loads((HERE / "package-lock.json").read_text(encoding="utf-8"))["packages"]["node_modules/electron"]["version"]
            check(label + ": supported Electron runtime packaged", result["electron"] == expected_runtime)
            check(label + ": actual main process", result["appPid"] == proc.pid)
            check(label + ": real garden rendered", result["rendered"] is True and bool(result["title"]))
            check(label + ": loopback UI", re.fullmatch(r"http://127\.0\.0\.1:\d+/?", result["baseUrl"]) is not None)
            check(label + ": screenshot captured", shot.is_file() and shot.stat().st_size > 1000)
            check(label + ": engine ownership", result["owned"] is owned)
            pet = result["pet"]
            check(label + ": real pet and tray", pet["rendered"] and pet["tray"])
            check(label + ": main closes and reopens", pet["closeAndReopen"])
            check(label + ": pet visibility and actions", pet["hideAndShow"] and pet["actionsReturnToBase"])
            check(label + ": scale through settings and tray", pet["settingsAndPresets"] and pet["finalScale"] == 1.7)
            check(label + ": scale survives restart or upgrade", pet["initialScale"] == initial_scale)
            if version != BASELINE_VERSION:
                check(label + ": catalog companion selection", pet.get("petSelection") is True and pet.get("petSelectionSync") is True)
                check(label + ": packaged roster matches source catalog", pet.get("defaultCompanions") == default_companions())
                check(label + ": both penguins render and switch", pet.get("penguinSelection") is True
                      and all(species in pet.get("companionSpecies", []) for species in ("pingu", "skipper")))
                check(label + ": backup export and restore", pet.get("backupRestore") is True)
                # smoke-pet reports null off Windows; this runner is Windows, so it must be true.
                check(label + ": transparent pet area clicks through", pet.get("clickThrough") is True)
            check(label + ": normal window exit", proc.wait(timeout=25) == 0)
            if owned:
                wait_process_gone(result["sidecarPid"])
            return result
        finally:
            stop_owned_tree(proc)


def assert_install_path(install_dir):
    stored = installation().get("InstallLocation", "")
    check("installer registry points only to this test directory",
          bool(stored) and Path(stored).resolve() == install_dir)


def local_request(engine, endpoint, method="GET", data=None):
    """engine is (base_url, token). The baseline beta0.9.2 engine has no token."""
    base_url, token = engine
    parsed = urlsplit(base_url)
    check("probe only calls loopback", parsed.hostname == "127.0.0.1")
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=5)
    try:
        body = json.dumps(data if data is not None else {}).encode("utf-8") if method == "POST" else None
        headers = {"Content-Type": "application/json"}
        if token:
            headers["X-SZU-Token"] = token
        conn.request(method, endpoint, body=body, headers=headers)
        response = conn.getresponse()
        check("local probe HTTP success", response.status == 200)
        return json.loads(response.read())
    finally:
        conn.close()


def local_status(engine, endpoint):
    """Status code of a GET that is expected to be refused."""
    base_url, token = engine
    parsed = urlsplit(base_url)
    check("probe only calls loopback", parsed.hostname == "127.0.0.1")
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=5)
    try:
        conn.request("GET", endpoint, headers={"X-SZU-Token": token} if token else {})
        response = conn.getresponse()
        response.read()
        return response.status
    finally:
        conn.close()


# The engine's stdout protocol lines (desktop/internal/ui/server.go announce).
ENDPOINT_LINE = re.compile(r"szuDesktop (?:已启动|已复用): (http://127\.0\.0\.1:\d+)\r?")
SESSION_LINE = re.compile(r"szuDesktop 会话: ([0-9a-f]{64})\r?")


def relay_engine_output(stream, log, found):
    """Copy engine output into the evidence log without its session token.

    The token only lives for this disposable engine, but evidence logs are
    uploaded as CI artifacts and must never carry credentials of any kind.
    """
    for raw in stream:
        line = raw.decode("utf-8", "replace").rstrip("\r\n")
        endpoint, session = ENDPOINT_LINE.fullmatch(line), SESSION_LINE.fullmatch(line)
        if endpoint and "url" not in found:
            found["url"] = endpoint.group(1)
        if session:
            found.setdefault("token", session.group(1))
            line = "szuDesktop 会话: <redacted>"
        log.write((line + "\n").encode("utf-8"))
        log.flush()


@contextmanager
def running_engine(sidecar, cfg, version, label):
    """Own a no-auto-login engine with isolated state for local-only probes.

    Yields ((base_url, token), proc). The published baseline predates the
    per-run API token, so its token is None and requests carry no header.
    """
    log_path = EVIDENCE / (label + ".log")
    with log_path.open("wb") as log:
        proc = subprocess.Popen([str(sidecar), "--no-open", "--no-auto-login", "--addr", "127.0.0.1:0"],
                                env=dict(os.environ, SZUNET_CONFIG_DIR=str(cfg)), stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
        found = {}
        relay = threading.Thread(target=relay_engine_output, args=(proc.stdout, log, found), daemon=True)
        relay.start()
        try:
            needs_token = version != BASELINE_VERSION
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                check("isolated portable engine remains alive", proc.poll() is None)
                if "url" in found and ("token" in found or not needs_token):
                    break
                time.sleep(.2)
            check("isolated portable engine reports URL", "url" in found)
            if needs_token:
                check("isolated portable engine reports its session token", "token" in found)
            engine = (found["url"], found.get("token"))
            check(label + ": engine version", local_request((engine[0], None), "/api/health")["app_version"] == version)
            if needs_token:
                check(label + ": engine rejects callers without the token",
                      local_status((engine[0], None), "/api/workspace") == 401)
            yield engine, proc
            local_request(engine, "/api/shutdown", "POST")
            check("test's portable engine shuts down normally", proc.wait(timeout=10) == 0)
        finally:
            stop_owned_tree(proc)
            relay.join(timeout=5)


def coexist_with_portable(exe, sidecar, cfg, version):
    """A pre-existing portable engine belongs to its launcher, not Electron."""
    with running_engine(sidecar, cfg, version, "portable-engine") as (engine, proc):
        result = launch(exe, cfg, version, "reuse-portable", owned=False)
        check("installer reuses the pre-existing engine", result["baseUrl"].rstrip("/") == engine[0])
        check("closing installer leaves portable engine alive", proc.poll() is None
              and local_request(engine, "/api/health")["app_version"] == version)


def seed_upgrade_data(engine):
    snapshot = local_request(engine, "/api/workspace")
    data = snapshot["data"]
    check("baseline really has its own companion roster",
          [pet["species"] for pet in data["game"]["pets"]] == BASELINE_COMPANIONS)
    data["profile"] = {"name": "升级验收", "college": "合成资料"}
    data["preferences"] = {"theme": "night", "motion": False, "onboarded": True}
    data["todos"] = [{"id": "upgrade-task", "text": "升级后保留的合成待办", "done": True, "rewarded": True}]
    data["courses"] = [{"name": "合成课程", "credit": 3, "point": 3.5, "term": "升级测试学期",
                        "code": "UPGRADE", "level": "undergrad", "grade": "", "source": "手动录入", "included": True}]
    data["semester"] = "2026-09-01"
    now = int(time.time() * 1000)
    data["reminders"] = [{"id": "upgrade-reminder", "place": "合成提醒", "start": now + 3600000, "end": now + 5400000}]
    game = data["game"]
    game["coins"], game["food"] = 137, 5
    game["seeds"]["radish"], game["stock"]["strawberry"] = 9, 4
    game["plots"][1] = {"crop": "strawberry", "planted": now, "ready": now + 300000, "watered": True}
    game["stats"].update({"focus": 3, "minutes": 75, "tasks": 1})
    game["pets"][0].update({"name": "留住荔宝", "xp": 125, "hunger": 100})
    game["pets"][1].update({"name": "留住栗栗", "xp": 75})
    # The turtle is retired from new saves; an existing save must keep it intact.
    game["pets"][3].update({"name": "留住阿青", "xp": 40})
    saved = local_request(engine, "/api/workspace", "POST", snapshot)
    # This deliberately invalid account is stored locally, never authenticated.
    fake = {"username": "installer-upgrade-fixture", "password": "synthetic-local-only-password"}
    local_request(engine, "/api/credential", "POST", fake)
    check("synthetic account is readable on the old version", local_request(engine, "/api/credential?reveal=1")["username"] == fake["username"])
    return saved


def assert_user_data(data, expected):
    # The UI smoke intentionally feeds/switches pets. Compare personal records
    # and progression, not time-decaying hunger or the last interaction message.
    for key in ("profile", "courses", "semester", "reminders"):
        check("upgrade preserves " + key, data[key] == expected[key])
    # The baseline fixture remains a real old-format save. Only documented new
    # defaults may be added; every original field and its value must survive.
    expected_preferences = {"noticeSource": "undergrad", "studentLevel": "undergrad", "homeSkin": "pixel",
                            **expected["preferences"]}
    expected_todos = [{"date": "", "createdAt": 0, "completedAt": 0, "archived": False, **todo}
                      for todo in expected["todos"]]
    check("upgrade preserves preferences and adds explicit defaults", data["preferences"] == expected_preferences)
    check("upgrade preserves todos without inventing dates", data["todos"] == expected_todos)
    for key in ("coins", "seeds", "stock", "plots", "stats"):
        check("upgrade preserves garden " + key, data["game"][key] == expected["game"][key])
    for index, pet in enumerate(expected["game"]["pets"]):
        current = data["game"]["pets"][index]
        check("upgrade keeps original companion and progression", current["species"] == pet["species"]
              and current["name"] == pet["name"] and current["xp"] >= pet["xp"])
    original_species = [pet["species"] for pet in expected["game"]["pets"]]
    upgraded_species = original_species + [species for species in default_companions() if species not in original_species]
    check("upgrade appends catalog defaults without removing or reordering old companions",
          [pet["species"] for pet in data["game"]["pets"]] == upgraded_species)


def main():
    if os.name != "nt" or os.environ.get("GITHUB_ACTIONS") != "true" or not os.environ.get("RUNNER_TEMP"):
        raise SystemExit("Installer smoke is only allowed on a disposable GitHub Windows runner; no installation performed.")
    import winreg
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    version = (ROOT / "internal" / "version" / "VERSION").read_text(encoding="utf-8").strip()
    check("valid release version", re.fullmatch(r"(?:beta|v)?\d+\.\d+\.\d+", version) is not None)
    semver = re.sub(r"^(?:beta|v)", "", version)
    installer = HERE / "release" / ("szuDesktop-Setup-" + semver + ".exe")
    check("final installer exists", installer.is_file())
    digest = hashlib.sha256(installer.read_bytes()).hexdigest()
    check("installer checksum matches", Path(str(installer) + ".sha256").read_text(encoding="ascii")
          == digest + "  " + installer.name + "\n")
    baseline = Path(os.environ["SZU_UPGRADE_INSTALLER"]).resolve()
    check("baseline is the separately downloaded published installer", baseline.is_file() and baseline != installer.resolve()
          and baseline.name == BASELINE_INSTALLER)
    check("candidate differs from the baseline version", version != BASELINE_VERSION)
    check("published baseline matches pinned release digest", hashlib.sha256(baseline.read_bytes()).hexdigest() == BASELINE_SHA256)
    check("published baseline checksum file agrees", Path(str(baseline) + ".sha256").read_text(encoding="ascii")
          == BASELINE_SHA256 + "  " + baseline.name + "\n")
    no_existing_installation()
    startup_before = reg_values(winreg.HKEY_CURRENT_USER, RUN_KEY, winreg.KEY_WOW64_64KEY)
    # The uninstall check below deletes this value name; never touch one we did not write.
    check("no pre-existing szuDesktop launch-at-login entry", APP_ID not in startup_before
          and APP_ID not in reg_values(winreg.HKEY_CURRENT_USER, STARTUP_APPROVED_KEY, winreg.KEY_WOW64_64KEY))
    runner_temp = Path(os.environ["RUNNER_TEMP"]).resolve()
    # The enclosing TemporaryDirectory is the only recursively cleaned path.
    # It is freshly allocated beneath runner temp and never an installed user path.
    with tempfile.TemporaryDirectory(prefix="szu-installer-", dir=runner_temp) as tmp:
        test_root = Path(tmp).resolve()
        check("test root stays within runner temp", test_root.parent == runner_temp and test_root.name.startswith("szu-installer-"))
        install_dir = (test_root / "安装 测试" / "szuDesktop").resolve()
        cfg = (test_root / "独立 用户配置").resolve()
        cfg.mkdir()
        workspace = cfg / "workspace-v1.json"
        preserved_files = (workspace, cfg / "credentials.json", cfg / "electron-profile" / "pet-settings.json")
        exe = install_dir / "szuDesktop.exe"
        uninstaller = install_dir / "Uninstall szuDesktop.exe"
        installed = False
        try:
            run_nsis(baseline, "/D=" + str(install_dir))
            assert_install_path(install_dir)
            installed = True
            check("main executable installed in Chinese/space path", exe.is_file())
            sidecar = install_dir / "resources" / "szudesktop-windows-amd64.exe"
            launch(exe, cfg, BASELINE_VERSION, "baseline-open", initial_scale=1, runtime=BASELINE_ELECTRON)
            with running_engine(sidecar, cfg, BASELINE_VERSION, "baseline-data") as (engine, _):
                expected = seed_upgrade_data(engine)
            preserved = {file: file.read_bytes() for file in preserved_files}
            check("test account is not stored in plaintext", b"synthetic-local-only-password" not in preserved[cfg / "credentials.json"])
            obsolete = install_dir / "resources" / "obsolete-upgrade-smoke.txt"
            obsolete.write_text("old version test resource", encoding="ascii")

            run_nsis(installer, "/D=" + str(install_dir))
            assert_install_path(install_dir)
            check("upgrade removes obsolete program files", not obsolete.exists())
            for file, contents in preserved.items():
                check("upgrade preserves " + file.name + " byte for byte before opening", file.read_bytes() == contents)
            check("installed Go engine matches final build", sidecar.read_bytes()
                  == (ROOT / "dist" / "szudesktop-windows-amd64.exe").read_bytes())
            # The baseline shipped every Chromium locale; the upgrade must leave only these two.
            locales = install_dir / "locales"
            check("only zh-CN and en-US Chromium locales installed", locales.is_dir()
                  and sorted(path.name for path in locales.iterdir()) == EXPECTED_LOCALES)
            with running_engine(sidecar, cfg, version, "upgraded-data") as (engine, _):
                check("new engine reads the unchanged old save", local_request(engine, "/api/workspace") == expected)
                check("new engine decrypts the old synthetic account", local_request(engine, "/api/credential?reveal=1")["username"]
                      == "installer-upgrade-fixture")
                check("saved account remains hidden by default", local_request(engine, "/api/credential")["username"] == "")
            first = launch(exe, cfg, version, "after-upgrade")
            assert_user_data(json.loads(workspace.read_bytes())["data"], expected["data"])
            launch(exe, cfg, version, "reopen")
            coexist_with_portable(exe, sidecar, cfg, version)
            assert_user_data(json.loads(workspace.read_bytes())["data"], expected["data"])
            check("no startup entries changed", startup_before == reg_values(winreg.HKEY_CURRENT_USER, RUN_KEY, winreg.KEY_WOW64_64KEY))
            # Last step before uninstall: the user turned on launch at login.
            seed_autostart(exe)
            (EVIDENCE / "summary.json").write_text(json.dumps({
                "version": version, "electron": first["electron"], "installer_sha256": digest,
                "upgrade_from": BASELINE_VERSION, "baseline_sha256": BASELINE_SHA256,
                "installed": True, "rendered": True, "reopened": True,
                "portable_engine_coexistence": True,
                "cross_version_upgrade_preserved_data": True, "obsolete_program_files_removed": True,
                "synthetic_account_decrypts_after_upgrade": True, "original_companion_progress_preserved": True,
                "backup_restore": first["pet"]["backupRestore"],
                "pet_and_tray": True, "pet_scale_persists": True,
                "companion_species": first["pet"]["companionSpecies"],
                "penguins_render_and_switch": first["pet"]["penguinSelection"],
                "pet_click_through": first["pet"]["clickThrough"],
                "locales": EXPECTED_LOCALES,
            }, ensure_ascii=False, indent=2), encoding="utf-8")
        finally:
            if installed:
                # Startup may fail before the first save exists. Do not obscure
                # that primary failure by asserting it was created during cleanup.
                saved_before_uninstall = {file: file.read_bytes() for file in preserved_files if file.is_file()}
                # The uninstaller recursively removes INSTDIR: verify the exact
                # canonical location and registry ownership immediately beforehand.
                check("uninstall target is inside this test root", install_dir.is_relative_to(test_root))
                assert_install_path(install_dir)
                check("uninstaller belongs to this installation", uninstaller.is_file()
                      and uninstaller.resolve().parent == install_dir)
                run_nsis(uninstaller, "_?=" + str(install_dir))
                check("uninstall removes main executable and engine", not exe.exists()
                      and not (install_dir / "resources").exists())
                check("uninstall removes its registration", not installation()
                      and not reg_values(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY, winreg.KEY_WOW64_64KEY))
                for file, contents in saved_before_uninstall.items():
                    check("uninstall keeps " + file.name + " byte for byte", file.is_file() and file.read_bytes() == contents)
                # installer.nsh customUnInstall (not --updated): no dead startup entry may survive.
                check("uninstall removes launch-at-login Run and StartupApproved values", not remove_autostart_leftovers())
                check("uninstall leaves other startup entries unchanged", startup_before
                      == reg_values(winreg.HKEY_CURRENT_USER, RUN_KEY, winreg.KEY_WOW64_64KEY))
    summary = json.loads((EVIDENCE / "summary.json").read_text(encoding="utf-8"))
    summary["uninstalled"] = True
    summary["autostart_removed_on_uninstall"] = True
    (EVIDENCE / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("ALL INSTALLER SMOKE CHECKS PASSED", flush=True)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    if sys.argv[1:] == ["--baseline"]:
        # The workflow downloads exactly this release asset; keep one source of truth.
        print(BASELINE_VERSION, BASELINE_INSTALLER)
    else:
        main()
