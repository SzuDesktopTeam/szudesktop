"""Upgrade evidence must reject damaged inputs and lost old fields; no native launch."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("dmg_upgrade_checks", ROOT / "desktop/electron/mac_upgrade.py")
upgrade = importlib.util.module_from_spec(spec); spec.loader.exec_module(upgrade)


def refuses(fn):
    try:
        fn()
    except AssertionError:
        return
    raise AssertionError("Damaged upgrade evidence was accepted")


assert upgrade.BASELINE_VERSION == "beta0.9.5"
assert upgrade.BASELINE_DIGESTS == {
    "arm64": "f1d1a81a7a80ee41f7c6260bf13be196a5f1f092426ed6b84d3f38ae9f1fae4b",
    "x64": "85111f01c441a6da4f1f740d64c52dbd1571a46f448540f43b2cbce9eee66346",
}
key = upgrade.cache_key()
with patch.dict(upgrade.BASELINE_DIGESTS, {"x64": "0" * 64}):
    assert upgrade.cache_key() != key, "A changed baseline digest must invalidate the cache"
with tempfile.TemporaryDirectory(prefix="szu-dmg-upgrade-check-") as tmp:
    directory = Path(tmp); file = directory / upgrade.baseline_name("arm64")
    content = b"synthetic pinned baseline"; digest = hashlib.sha256(content).hexdigest()
    sentinel = directory / "unrelated.txt"; sentinel.write_text("keep")
    def downloaded(*args, **kwargs):
        file.write_bytes(content); Path(str(file) + ".sha256").write_bytes((digest + "  " + file.name + "\n").encode("ascii"))
    with patch.dict(upgrade.BASELINE_DIGESTS, {"arm64": digest}), patch.object(upgrade.subprocess, "run", side_effect=downloaded) as download:
        upgrade.prepare(directory, "arm64"); assert download.call_count == 1
        upgrade.prepare(directory, "arm64"); assert download.call_count == 1
        file.write_bytes(b"damaged"); refuses(lambda: upgrade.verify_baseline(file, "arm64"))
        upgrade.prepare(directory, "arm64"); assert download.call_count == 2
        assert sentinel.read_text() == "keep"
        Path(str(file) + ".sha256").write_bytes((digest + "  wrong-name.dmg\n").encode("ascii"))
        refuses(lambda: upgrade.verify_baseline(file, "arm64"))
print("PASS pinned baseline rejects damaged bytes/checksum names; cache avoids download and preserves unrelated files")

expected = {"workspace": {"profile": {"name": "old"}, "courses": [{"code": "old-course"}], "semester": "old-term", "reminders": [],
                          "preferences": {"theme": "night"}, "todos": [{"id": "old-task"}],
                          "game": {"coins": 137, "seeds": {}, "stock": {}, "plots": [], "stats": {},
                                   "pets": [{"species": "libao", "name": "old-name", "xp": 125}]}},
            "notebook": {"courses": [], "notes": [{"id": "old-note", "body": "old body"}], "preferences": {}},
            "credential": {"username": "synthetic", "password": "synthetic-only"}}
state = copy.deepcopy(expected)
def call(_engine, endpoint, method="GET", data=None):
    key = {"/api/workspace": "workspace", "/api/notebook": "notebook", "/api/credential?reveal=1": "credential"}[endpoint]
    if data is not None:
        state[key] = copy.deepcopy(data["data"])
    return copy.deepcopy(state[key] if key == "credential" else {"version": 1, "revision": 2, "data": state[key]})
with patch.object(upgrade, "call", side_effect=call):
    upgrade.verify_data(None, expected)
    upgrade.verify_data(None, expected, write=True)
    assert state["workspace"]["profile"]["name"].endswith("新版写入")
    assert state["notebook"]["notes"][0]["body"].endswith("Candidate write persisted")
    good = copy.deepcopy(state)
    mutations = [lambda: state["workspace"]["profile"].update(name="lost"),
                 lambda: state["workspace"]["todos"].clear(),
                 lambda: state["workspace"]["game"]["pets"][0].update(xp=0),
                 lambda: state["workspace"]["game"]["pets"].clear(),
                 lambda: state["notebook"]["notes"][0].update(body="lost"),
                 lambda: state["credential"].update(password="wrong")]
    for mutate in mutations:
        state = copy.deepcopy(good); mutate(); refuses(lambda: upgrade.verify_data(None, expected))
print("PASS upgrade verifies old personal records, notebook and synthetic credentials; detects losses and persists new writes")
print("2 DMG upgrade logic checks passed")
