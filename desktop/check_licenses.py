"""Check license payload inputs, and optionally inspect built release artifacts."""
import argparse
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EXPECTED = {
    "LICENSE": ROOT / "LICENSE",
    "THIRD_PARTY_NOTICES.md": ROOT / "THIRD_PARTY_NOTICES.md",
    "FONT-LICENSE-OFL.txt": ROOT / "desktop/assets/fonts/LICENSE-OFL.txt",
    "2048-MIT.txt": ROOT / "desktop/assets/garden/licenses/2048-MIT.txt",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--portable", type=Path)
    parser.add_argument("--electron", type=Path, help="win-unpacked directory")
    args = parser.parse_args()
    config = (ROOT / "desktop/electron/electron-builder.yml").read_text(encoding="utf-8")
    packer = (ROOT / "desktop/make_release.py").read_text(encoding="utf-8")
    for name, source in EXPECTED.items():
        assert source.read_bytes(), f"Missing license text: {source}"
        assert f"to: licenses/{name}" in config, f"Electron license payload missing: {name}"
        assert f'z.writestr("{name}"' in packer, f"Portable license payload missing: {name}"
    if args.portable:
        with zipfile.ZipFile(args.portable) as archive:
            for name, source in EXPECTED.items():
                assert archive.read(name) == source.read_bytes(), f"Portable license differs: {name}"
    if args.electron:
        for name, source in EXPECTED.items():
            assert (args.electron / "resources/licenses" / name).read_bytes() == source.read_bytes(), f"Electron license differs: {name}"
        for name in ("LICENSE.electron.txt", "LICENSES.chromium.html"):
            assert (args.electron / name).stat().st_size > 0, f"Runtime license missing: {name}"
    print("PASS license sources and package configuration" + ("; built artifact contents verified" if args.portable or args.electron else " (artifacts not inspected)"))


if __name__ == "__main__":
    main()
