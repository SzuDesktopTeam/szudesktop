"""Pinned DMG upgrade inputs and local-only data probes; never installs globally."""
import argparse
from contextlib import contextmanager
import hashlib
import http.client
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from urllib.parse import urlsplit

BASELINE_VERSION = "beta0.9.5"
BASELINE_ELECTRON = "44.4.5"
BASELINE_DIGESTS = {
    "arm64": "f1d1a81a7a80ee41f7c6260bf13be196a5f1f092426ed6b84d3f38ae9f1fae4b",
    "x64": "85111f01c441a6da4f1f740d64c52dbd1571a46f448540f43b2cbce9eee66346",
}


def baseline_name(arch):
    return "szuDesktop-0.9.5-mac-%s.dmg" % arch


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


def seed(engine):
    workspace = call(engine, "/api/workspace")
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


def verify_data(engine, expected, write=False):
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
    if any(credential.get(key) != value for key, value in expected["credential"].items()):
        raise AssertionError("Upgrade cannot decrypt synthetic baseline credentials")
    if write:
        workspace["data"]["profile"]["name"] += " · 新版写入"
        notebook["data"]["notes"][0]["body"] += "\nCandidate write persisted"
        expected["workspace"] = call(engine, "/api/workspace", "POST", workspace)["data"]
        expected["notebook"] = call(engine, "/api/notebook", "PUT", notebook)["data"]
        verify_data(engine, expected)


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
