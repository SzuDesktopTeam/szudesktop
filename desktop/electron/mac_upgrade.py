"""Pinned DMG upgrade inputs and local-only data probes; never installs globally."""
import argparse
from contextlib import contextmanager
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urlsplit

BASELINE_VERSION = "beta0.9.6"
BASELINE_ELECTRON = "44.4.5"
BASELINE_DIGESTS = {
    "arm64": "2d28f939a5c8f51e5381268e037c268acf3edac831c644a7d3e7cb01c7e5a2b7",
    "x64": "07e428960252c33d484e366120bd9e8248227a59e1b023e4d8eb51b829df2ac1",
}


def baseline_name(arch):
    return "szuDesktop-0.9.6-mac-%s.dmg" % arch


def cache_key():
    return "szu-dmg-upgrade-" + hashlib.sha256("".join(BASELINE_DIGESTS.values()).encode("ascii")).hexdigest()


def verify_baseline(file, arch):
    file = Path(file)
    expected = BASELINE_DIGESTS[arch]
    if file.name != baseline_name(arch) or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        raise AssertionError("DMG baseline differs from the pinned published release")
    if Path(str(file) + ".sha256").read_bytes() != (expected + "  " + file.name + "\n").encode("ascii"):
        raise AssertionError("DMG baseline checksum file differs")
    return expected


def prepare(directory, arch):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    file = directory / baseline_name(arch)
    try:
        verify_baseline(file, arch)
        print("Pinned baseline from cache: " + file.name, flush=True)
        return
    except (OSError, AssertionError):
        # Only replace these two named cache files, never recursively delete a supplied directory.
        file.unlink(missing_ok=True)
        Path(str(file) + ".sha256").unlink(missing_ok=True)
    subprocess.run(["gh", "release", "download", BASELINE_VERSION, "--repo", "SzuDesktopTeam/szudesktop",
                    "--pattern", file.name, "--pattern", file.name + ".sha256", "--dir", str(directory)], check=True)
    verify_baseline(file, arch)


def call(engine, endpoint, method="GET", data=None):
    url, token = engine
    parsed = urlsplit(url)
    if parsed.hostname != "127.0.0.1":
        raise AssertionError("Upgrade probe must stay on loopback")
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=10)
    try:
        conn.request(method, endpoint, body=json.dumps(data).encode("utf-8") if data is not None else None,
                     headers={"X-SZU-Token": token, "Content-Type": "application/json"})
        response = conn.getresponse()
        body = response.read()
        if response.status != 200:
            raise AssertionError("Upgrade probe HTTP %d: %s" % (response.status, endpoint))
        return json.loads(body)
    finally:
        conn.close()


@contextmanager
def engine_probe(binary, cfg, version, log_path, protocol, stop):
    """Starts only the copied bundle's engine with auto login disabled and redacted logs."""
    found = {}
    with Path(log_path).open("wb") as log:
        proc = subprocess.Popen([str(binary), "--no-open", "--no-auto-login", "--addr", "127.0.0.1:0"],
                                env=dict(os.environ, SZUNET_CONFIG_DIR=str(cfg)), stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
        def relay():
            for raw in proc.stdout:
                line = raw.decode("utf-8", "replace").rstrip("\r\n")
                endpoint, session = protocol.ENDPOINT_LINE.fullmatch(line), protocol.SESSION_LINE.fullmatch(line)
                if endpoint:
                    found.setdefault("url", endpoint.group(2))
                if session:
                    found.setdefault("token", session.group(1))
                    line = "szuDesktop 会话: <redacted>"
                log.write((line + "\n").encode("utf-8")); log.flush()
        reader = threading.Thread(target=relay, daemon=True); reader.start()
        try:
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline and not ("url" in found and "token" in found):
                if proc.poll() is not None:
                    raise AssertionError("Upgrade engine exited before announcing")
                time.sleep(.1)
            if "url" not in found or "token" not in found:
                raise AssertionError("Upgrade engine did not announce")
            engine = (found["url"], found["token"])
            if call(engine, "/api/health")["app_version"] != version:
                raise AssertionError("Wrong upgrade engine version")
            yield engine
            call(engine, "/api/shutdown", "POST", {})
            if proc.wait(timeout=10) != 0:
                raise AssertionError("Upgrade engine did not exit normally")
        finally:
            stop(proc); reader.join(timeout=5)


def initial_workspace(engine, directory):
    """Use the immutable old engine's own pure garden rules, not current defaults."""
    directory = Path(directory)
    directory.mkdir()  # Never reuse or overwrite an existing module directory.
    parsed = urlsplit(engine[0])
    if parsed.hostname != "127.0.0.1":
        raise AssertionError("Baseline modules must come from the owned loopback engine")
    visited = set()
    def copy_module(name):
        if not re.fullmatch(r"[\w.-]+\.mjs", name):
            raise AssertionError("Unexpected baseline module path")
        if name in visited:
            return
        visited.add(name)
        conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=10)
        try:
            conn.request("GET", "/assets/garden/" + name, headers={"X-SZU-Token": engine[1]})
            response = conn.getresponse()
            source = response.read()
            if response.status != 200:
                raise AssertionError("Cannot read baseline garden module")
        finally:
            conn.close()
        (directory / name).write_bytes(source)
        for specifier in re.findall(r"\b(?:from|import)\s*['\"]([^'\"]+)['\"]", source.decode("utf-8")):
            if not re.fullmatch(r"\./[\w.-]+\.mjs", specifier):
                raise AssertionError("Baseline garden rules must use flat local module imports")
            copy_module(specifier[2:])
    copy_module("engine.mjs")
    result = subprocess.run(["node", "--input-type=module", "--eval",
                             "import {pathToFileURL} from 'node:url'; const {createState}=await import(pathToFileURL(process.argv[1]).href); console.log(JSON.stringify(createState()));",
                             str(directory / "engine.mjs")], capture_output=True, timeout=30)
    if result.returncode != 0:
        raise AssertionError("Cannot initialize state with the published baseline garden rules")
    return json.loads(result.stdout)


def seed(engine, initial_state):
    workspace = call(engine, "/api/workspace")
    if workspace["data"] is None:
        workspace["data"] = initial_state()
    data = workspace["data"]
    data["profile"] = {"name": "Mac升级验收", "college": "隔离合成资料"}
    data["preferences"].update(theme="night", motion=False, onboarded=True)
    data["todos"] = [{"id": "mac-upgrade-task", "text": "原版待办保留", "done": True, "rewarded": True}]
    data["courses"] = [{"name": "合成课程", "code": "MAC-UPGRADE", "credit": 3, "point": 3.5,
                        "term": "升级测试学期", "level": "undergrad", "grade": "", "source": "手动录入", "included": True}]
    data["game"]["coins"] = 137
    data["game"]["pets"][0].update(name="升级前的荔宝", xp=125)
    workspace = call(engine, "/api/workspace", "POST", workspace)
    notebook = call(engine, "/api/notebook")
    notebook["data"] = {"courses": [{"id": "mac-course", "name": "旧版课程", "sharedUrl": ""}],
                        "notes": [{"id": "mac-note", "courseId": "mac-course", "title": "旧版笔记",
                                   "body": "Synthetic baseline note", "createdAt": 1, "updatedAt": 2}],
                        "preferences": {"selectedNoteId": "mac-note", "selectedCourseId": "mac-course"}}
    notebook = call(engine, "/api/notebook", "PUT", notebook)
    fake = {"username": "mac-upgrade-fixture", "password": "synthetic-local-only-password"}
    call(engine, "/api/credential", "POST", fake)
    if call(engine, "/api/credential?reveal=1").get("username") != fake["username"]:
        raise AssertionError("Baseline synthetic credential could not be read")
    return {"workspace": workspace["data"], "notebook": notebook["data"], "credential": fake}


def seed_shell_settings(cfg):
    """Version-1 shell fixtures, not evidence of old-version UI acceptance."""
    profile = Path(cfg) / "electron-profile"
    profile.mkdir(parents=True, exist_ok=True)
    settings = {"pet-settings.json": {"version": 1, "scale": 1.7},
                "desktop-settings.json": {"version": 1, "focusNotifications": True, "doNotDisturb": False,
                                          "petVisible": True, "petAlwaysOnTop": True, "autoConnectCampus": False,
                                          "lastNotifiedFocus": None}}
    for name, data in settings.items():
        file = profile / name
        with file.open("x", encoding="utf-8") as output:
            json.dump(data, output)
        file.chmod(0o600)


def read_synthetic_credential(cfg, allowed_root):
    cfg, allowed_root = Path(cfg), Path(allowed_root)
    if not cfg.is_absolute() or not cfg.resolve().is_relative_to(allowed_root.resolve()) or cfg.resolve() == allowed_root.resolve():
        raise AssertionError("Credential probe requires this smoke's isolated configuration")
    suffix = hashlib.sha256(os.path.normpath(os.path.abspath(cfg)).encode("utf-8")).hexdigest()[:12]
    result = subprocess.run(["/usr/bin/security", "find-generic-password", "-a", "szunet",
                             "-s", "szunet-test-" + suffix, "-w"], capture_output=True)
    if result.returncode != 0:
        raise AssertionError("Cannot read the isolated synthetic credential")
    try:
        return json.loads(result.stdout)
    except (ValueError, UnicodeError):
        raise AssertionError("Isolated synthetic credential is not valid JSON") from None


def verify_data(engine, expected, read_credential, write=False):
    workspace = call(engine, "/api/workspace")
    data, original = workspace["data"], expected["workspace"]
    for key in ("profile", "courses", "semester", "reminders"):
        if data[key] != original[key]:
            raise AssertionError("Upgrade lost workspace " + key)
    preferences = {"noticeSource": "undergrad", "studentLevel": "undergrad", "homeSkin": "pixel", **original["preferences"]}
    todos = [{"date": "", "createdAt": 0, "completedAt": 0, "archived": False, **item} for item in original["todos"]]
    if data["preferences"] not in (original["preferences"], preferences) or data["todos"] not in (original["todos"], todos):
        raise AssertionError("Upgrade lost preferences or todos")
    for key in ("coins", "seeds", "stock", "plots", "stats"):
        if data["game"][key] != original["game"][key]:
            raise AssertionError("Upgrade lost garden " + key)
    for old, new in zip(original["game"]["pets"], data["game"]["pets"]):
        if any(old[key] != new[key] for key in ("species", "name")) or new["xp"] < old["xp"]:
            raise AssertionError("Upgrade lost companion progression")
    if len(data["game"]["pets"]) < len(original["game"]["pets"]):
        raise AssertionError("Upgrade lost companions")
    notebook = call(engine, "/api/notebook")
    if notebook["data"] != expected["notebook"]:
        raise AssertionError("Upgrade lost notebook data")
    credential = call(engine, "/api/credential?reveal=1")
    # The API deliberately never exposes passwords; successful Load proves the engine
    # can read the entry. Compare full synthetic bytes separately, only in our namespace.
    if credential.get("saved") is not True or credential.get("username") != expected["credential"]["username"] or "password" in credential:
        raise AssertionError("Upgrade cannot load synthetic credentials through the private API")
    if read_credential() != expected["credential"]:
        raise AssertionError("Upgrade cannot decrypt synthetic baseline credentials")
    if write:
        workspace["data"]["profile"]["name"] += " · 新版写入"
        notebook["data"]["notes"][0]["body"] += "\nCandidate write persisted"
        expected["workspace"] = call(engine, "/api/workspace", "POST", workspace)["data"]
        expected["notebook"] = call(engine, "/api/notebook", "PUT", notebook)["data"]
        verify_data(engine, expected, read_credential)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-key", action="store_true")
    parser.add_argument("--directory", type=Path)
    parser.add_argument("--arch", choices=BASELINE_DIGESTS, action="append")
    args = parser.parse_args()
    if args.cache_key:
        print(cache_key())
    elif args.directory and args.arch:
        for arch in args.arch:
            prepare(args.directory, arch)
    else:
        parser.error("pass --cache-key or --directory and --arch")
