"""Check license payload inputs, and optionally inspect built release artifacts."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "desktop/assets/garden/vendor"
EXPECTED = {
    "LICENSE": ROOT / "LICENSE",
    "THIRD_PARTY_NOTICES.md": ROOT / "THIRD_PARTY_NOTICES.md",
    "FONT-LICENSE-OFL.txt": ROOT / "desktop/assets/fonts/LICENSE-OFL.txt",
    "2048-MIT.txt": ROOT / "desktop/assets/garden/licenses/2048-MIT.txt",
    "Three-MIT.txt": ROOT / "desktop/assets/garden/vendor/three/LICENSE.txt",
    "Sakura-Crossing-MIT.txt": ROOT / "desktop/assets/garden/vendor/sakura/LICENSE.txt",
}


def check_vendor_hashes():
    """The bundled third-party files must be byte-identical to what SOURCE.json records.

    go:embed ships the working-tree bytes. A CRLF checkout (Windows without the
    repository's .gitattributes) silently changes every vendored module, so the
    provenance record no longer matches what users receive.
    """
    source = json.loads((VENDOR / "SOURCE.json").read_text(encoding="utf-8"))
    files = [entry for library in source.values() if isinstance(library, dict)
             for entry in library.get("files", [])]
    assert files, "SOURCE.json lists no vendored files"
    for entry in files:
        data = (VENDOR / entry["path"]).read_bytes()
        if hashlib.sha256(data).hexdigest() == entry["sha256"]:
            continue
        if b"\r\n" in data and hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest() == entry["sha256"]:
            raise AssertionError(
                f"Vendored file checked out with CRLF line endings: {entry['path']}. "
                "The repository's .gitattributes keeps these files LF; re-checkout with "
                "`rm -r desktop/assets/garden/vendor && git checkout -- desktop/assets/garden/vendor`. "
                "A clone made before .gitattributes existed keeps every other text file CRLF too; "
                "to renormalize the whole working tree, first commit or stash local changes, then run "
                "`git rm -rq --cached . && git reset --hard`.")
        raise AssertionError(f"Vendored file differs from SOURCE.json sha256: {entry['path']}")
    return len(files)


# Electron 与 Chromium 自带的许可。Windows 上留在安装目录；macOS 上 DMG 只装 .app，
# 所以 mac-electron-licenses.cjs 在打包时把它们复制进 .app 的 licenses 目录。
RUNTIME_LICENSES = ("LICENSE.electron.txt", "LICENSES.chromium.html")


def check_mac_app(app):
    """macOS 安装版：项目许可与运行时许可都在 <app>/Contents/Resources/licenses。

    DMG 里只有 .app，electron-builder 解压在 .app 外面的 LICENSE / LICENSES.chromium.html
    到不了用户手里，只看输出目录会误以为许可都在。
    """
    licenses = app / "Contents/Resources/licenses"
    for name, source in EXPECTED.items():
        assert (licenses / name).read_bytes() == source.read_bytes(), f"macOS license differs: {name}"
    for name in RUNTIME_LICENSES:
        assert (licenses / name).stat().st_size > 0, f"Runtime license missing in .app: {name}"


def self_test_mac_app():
    """.app 模式在每个平台的回归里都自测一遍：完整的包通过，缺运行时许可或项目许可被改都要报错。

    真正的 .app 只有 macOS 打包 job 才有；不在这里自测，这个分支坏了要等到打 DMG 才发现。
    """
    def fake_app(root, drop=None, alter=None):
        licenses = root / "szuDesktop.app/Contents/Resources/licenses"
        licenses.mkdir(parents=True)
        for name, source in EXPECTED.items():
            if name != drop:
                (licenses / name).write_bytes(b"altered" if name == alter else source.read_bytes())
        for name in RUNTIME_LICENSES:
            if name != drop:
                (licenses / name).write_text("runtime license\n", encoding="ascii")
        return root / "szuDesktop.app"

    with tempfile.TemporaryDirectory(prefix="szu-license-app-") as tmp:
        check_mac_app(fake_app(Path(tmp) / "complete"))
        for label, broken in (("missing Chromium license", {"drop": "LICENSES.chromium.html"}),
                              ("changed project license", {"alter": "LICENSE"})):
            try:
                check_mac_app(fake_app(Path(tmp) / label.replace(" ", "-"), **broken))
            except (AssertionError, OSError):
                continue
            raise AssertionError(".app license check accepted a bundle with a " + label)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--portable", type=Path)
    parser.add_argument("--electron", type=Path, help="win-unpacked directory, or a macOS szuDesktop.app")
    args = parser.parse_args()
    config = (ROOT / "desktop/electron/electron-builder.yml").read_text(encoding="utf-8")
    packer = (ROOT / "desktop/make_release.py").read_text(encoding="utf-8")
    for name, source in EXPECTED.items():
        assert source.read_bytes(), f"Missing license text: {source}"
        assert f"to: licenses/{name}" in config, f"Electron license payload missing: {name}"
        assert f'z.writestr("{name}"' in packer, f"Portable license payload missing: {name}"
    vendored = check_vendor_hashes()
    if args.portable:
        with zipfile.ZipFile(args.portable) as archive:
            for name, source in EXPECTED.items():
                assert archive.read(name) == source.read_bytes(), f"Portable license differs: {name}"
    self_test_mac_app()
    if args.electron and args.electron.name.endswith(".app"):
        check_mac_app(args.electron)
    elif args.electron:
        for name, source in EXPECTED.items():
            assert (args.electron / "resources/licenses" / name).read_bytes() == source.read_bytes(), f"Electron license differs: {name}"
        for name in ("LICENSE.electron.txt", "LICENSES.chromium.html"):
            assert (args.electron / name).stat().st_size > 0, f"Runtime license missing: {name}"
    print(f"PASS {vendored} vendored files match SOURCE.json sha256")
    print("PASS macOS .app license layout self-test")
    print("PASS license sources and package configuration" + ("; built artifact contents verified" if args.portable or args.electron else " (artifacts not inspected)"))


if __name__ == "__main__":
    main()
