"""发版版本号一致性：只核对「每次发版都必须改」的锚点，不碰历史记录。

版本号散落在中英 README 的下载链接、CHANGELOG 最新一节、STATUS.md 当前版本行，
以及三份升级基线脚本和发布流水线的基线步骤名。上一版手工改过八个文件，
漏一处就会出现「README 指向不存在的附件」或「升级基线等于候选版导致 CI 罢工」。
"""
import re
import sys
from pathlib import Path

# Windows runner 的默认控制台是 cp1252；中文成功信息会在 print 时抛 UnicodeEncodeError。
# 与 desktop/check_status_doc.py 等检查保持一致，统一按 UTF-8 输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
VERSION_RE = re.compile(r"^beta\d+\.\d+\.\d+$")
TAG_RE = re.compile(r"releases/download/(beta\d+\.\d+\.\d+)/")

problems = []


def read(rel):
    path = ROOT / rel
    if not path.is_file():
        problems.append(f"{rel}: 文件不存在")
        return ""
    return path.read_text(encoding="utf-8")


def expect(condition, message):
    if not condition:
        problems.append(message)


version = read("internal/version/VERSION").strip()
expect(bool(VERSION_RE.match(version)), f"internal/version/VERSION 格式不对：{version!r}")
ver = version.removeprefix("beta")

# 中英 README 的每一个下载直链都必须指向当前标签，且文件名也是当前版本。
for rel in ("README.md", "docs/README_en.md"):
    text = read(rel)
    tags = set(TAG_RE.findall(text))
    expect(tags == {version}, f"{rel}: 下载链接指向 {sorted(tags) or '无'}，应为 {version}")
    for asset in (f"szuDesktop-Setup-{ver}.exe", f"szuDesktop-{ver}-portable.exe",
                  f"szuDesktop-{ver}-mac-arm64.dmg", f"szuDesktop-{ver}-mac-x64.dmg"):
        expect(asset in text, f"{rel}: 缺少 {asset} 的下载链接")

changelog = read("CHANGELOG.md")
latest = re.search(r"^## (beta\d+\.\d+\.\d+)\s*$", changelog, re.M)
expect(latest is not None and latest.group(1) == version,
       f"CHANGELOG.md: 最新一节是 {latest.group(1) if latest else '无'}，应为 {version}")

status = read("docs/STATUS.md")
current = re.search(r"\*\*当前版本：(beta\d+\.\d+\.\d+)。\*\*", status)
expect(current is not None and current.group(1) == version,
       f"docs/STATUS.md: 当前版本是 {current.group(1) if current else '无'}，应为 {version}")

# 升级基线必须整体前移：三份脚本与流水线的步骤名说的是同一个旧版本，且不能等于候选版。
BASELINE_RE = re.compile(r'BASELINE_VERSION\s*(?:==|=)\s*["\'](beta\d+\.\d+\.\d+)["\']')
STEP_RE = re.compile(r"核对并准备 (beta\d+\.\d+\.\d+) DMG 升级基线")
baseline_hits = {}
for rel in ("desktop/electron/smoke_installer.py", "desktop/electron/mac_upgrade.py",
            "desktop/check_dmg_upgrade.py"):
    found = set(BASELINE_RE.findall(read(rel)))
    expect(len(found) == 1, f"{rel}: 期望恰好一个 BASELINE_VERSION，实际 {sorted(found)}")
    baseline_hits[rel] = found
steps = set(STEP_RE.findall(read(".github/workflows/release.yml")))
expect(len(steps) == 1, f".github/workflows/release.yml: 升级基线步骤名不统一 {sorted(steps)}")
baseline_hits[".github/workflows/release.yml"] = steps

all_baselines = set().union(*baseline_hits.values())
detail = "; ".join(f"{k}={sorted(v)}" for k, v in baseline_hits.items())
expect(len(all_baselines) == 1, f"升级基线各说各话：{detail}")
baseline = next(iter(all_baselines)) if len(all_baselines) == 1 else "未统一"
if len(all_baselines) == 1:
    expect(baseline != version, f"升级基线 {baseline} 等于当前候选版 {version}，CI 会因为「从自己升到自己」失败")

if problems:
    print("版本号一致性检查失败：", file=sys.stderr)
    for item in problems:
        print("  - " + item, file=sys.stderr)
    sys.exit(1)
print(f"版本号一致：当前 {version}，升级基线 {baseline}")
