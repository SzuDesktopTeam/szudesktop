"""LICENSE 必须是可被识别的标准 MIT 全文，来源说明放 THIRD_PARTY_NOTICES.md。

背景见 docs/adr/0005：曾经把第三方声明和「来源仍在核对」的自定义段落追加在
LICENSE 里，GitHub 的许可证识别因此返回 NOASSERTION —— 徽章写着 MIT，仓库
页面却说许可不明。项目许可文件要保持机器可读，明细另放一处。
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
notices_text = (ROOT / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")

problems = []
lines = [line.rstrip("\r") for line in license_text.strip().split("\n")]

if lines[0] != "MIT License":
    problems.append("首行不是 'MIT License'")
if not any(line.startswith("Copyright (c)") for line in lines):
    problems.append("缺少版权声明行")
for phrase in ("Permission is hereby granted, free of charge",
               "The above copyright notice and this permission notice",
               'THE SOFTWARE IS PROVIDED "AS IS"'):
    if not any(phrase in line for line in lines):
        problems.append(f"缺少 MIT 标准条款：{phrase}")

# 附加段落会让 GitHub licensee 认不出 MIT；明细必须搬到独立文件。
for forbidden in ("---", "Third-party notices", "第三方代码声明",
                  "实验模块说明", "来源与授权范围仍在核对", "不替代任何第三方组件"):
    if forbidden in license_text:
        problems.append(f"LICENSE 里混入了附加内容：{forbidden!r}，请移到 THIRD_PARTY_NOTICES.md")

if len(lines) > 25:
    problems.append(f"LICENSE 有 {len(lines)} 行，标准 MIT 全文约 21 行；检查是否又追加了内容")

# 搬走的东西要有下落，不能删掉了事。
for phrase in ("xEncode", "Fusion Pixel", "Sakura Crossing", "VPN"):
    if phrase not in notices_text:
        problems.append(f"THIRD_PARTY_NOTICES.md 缺少 {phrase} 的来源说明")

if problems:
    print("LICENSE 规范性检查失败：", file=sys.stderr)
    for item in problems:
        print("  - " + item, file=sys.stderr)
    sys.exit(1)
print(f"LICENSE 标准 MIT 全文（{len(lines)} 行），第三方明细在 THIRD_PARTY_NOTICES.md")
