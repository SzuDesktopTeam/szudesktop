"""macOS 引擎构建与两个冒烟脚本的纯逻辑检查：python desktop/check_macos_scripts.py

build-macos.py、smoke_macos.py、electron/smoke_dmg.py 只在 macOS 上真跑，而且冒烟默认只在 GitHub runner 上跑；
里面有几条规则一旦走偏，CI 仍可能是绿的，后果却落在开发机上：
- 钥匙串后缀：冒烟按它找本次建的 -test- 条目来删。和 Go 侧（keychain_namespace.go）算得不一样时，
  条目删不掉会留在用户的钥匙串里，只有 Go 侧的已知答案测试知道。
- 退出轨迹要按子序列核对（真实退出在 confirmed 之后还会再记一次 before-quit）；DMG 卷上的白名单。
- 没有 --local 就什么都不做：开发机上误跑会开窗口、写偏好、建钥匙串条目。
- 构建脚本的签名标识、先删旧产物、.sha256 的格式：包里的引擎能否与冒烟通过的那份逐字节一致，靠的就是这几条。
这里不启动任何引擎或应用，三个平台的 CI 都能跑；只有依赖 POSIX 路径规则的部分在 Windows 上跳过。

新增检查按 desktop/check_*.py 命名，desktop/run-checks.mjs 会自动发现并运行。
"""
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

# 与其它检查脚本一致：GitHub 的 Windows runner 可能是 CP1252，中文检查名统一按 UTF-8 输出。
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
DESKTOP = ROOT / "desktop"
BUILD = DESKTOP / "build-macos.py"
SMOKE_ENGINE = DESKTOP / "smoke_macos.py"
SMOKE_DMG = DESKTOP / "electron" / "smoke_dmg.py"
# 冒烟脚本的钥匙串规则按 os.path 的 POSIX 语义写（/tmp/szu-cfg/ 在 Windows 上不是绝对路径），只在 POSIX 宿主上导入核对。
POSIX = os.sep == "/"

count = 0


def check(name, fn):
    global count
    fn()
    count += 1
    print("PASS " + name)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_refusing(scripts, target, *args):
    """把脚本复制到临时目录里运行（不带 --local、也不像 GitHub runner），它必须立刻以非零退出。

    临时目录里没有 dist/、VERSION、sync-assets.py 和 Go 模块：万一拒绝的判断坏了，脚本也只会读不到文件而失败，
    不会在这台机器上真的编译、启动引擎、开窗口或建钥匙串条目。
    """
    env = {k: v for k, v in os.environ.items() if k not in ("GITHUB_ACTIONS", "RUNNER_TEMP")}
    with tempfile.TemporaryDirectory(prefix="szu-check-macos-") as tmp:
        for script in scripts:
            copy = Path(tmp) / script.relative_to(ROOT)
            copy.parent.mkdir(parents=True, exist_ok=True)
            copy.write_bytes(script.read_bytes())
        copy = Path(tmp) / target.relative_to(ROOT)
        return subprocess.run([sys.executable, str(copy), *args], env=env, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=60, cwd=tmp)


build = load("build_macos_under_check", BUILD)


def test_build_constants():
    assert build.IDENTIFIER == "com.szudesktop.engine", build.IDENTIFIER
    assert build.LIPO == {"arm64": "arm64", "amd64": "x86_64"}, build.LIPO
    # signIgnore 排除的正是 build-mac.mjs 放引擎的位置：osx-sign 不重签，包里的引擎才与 dist 里签好的那份一致。
    yml = (DESKTOP / "electron" / "electron-builder.yml").read_text(encoding="utf-8")
    assert re.search(r"signIgnore:\s*\n\s*-\s*/Contents/MacOS/szudesktop-engine\$", yml), "signIgnore 没有排除 Contents/MacOS/szudesktop-engine"


def test_build_source_rules():
    # 仓库按 LF 检出（.gitattributes）；个别旧的 Windows 工作副本仍是 CRLF，先统一再比对。
    source = BUILD.read_text(encoding="utf-8").replace("\r\n", "\n")
    # go build 发现 build ID 没变就不重写：不先删，上一次签过名的旧文件会原样留着，后面的核对就看不到这次的结果。
    assert re.search(r'for path in \(out, out \+ "\.sha256"\):\s*\n\s*if os\.path\.exists\(path\):\s*\n\s*os\.remove\(path\)', source), \
        "编译前没有先删旧的引擎与 .sha256"
    assert source.index("os.remove(path)") < source.index('"go", "build"'), "删旧产物必须在 go build 之前"
    assert 'CGO_ENABLED="0"' in source and '"-trimpath"' in source, "引擎要纯 Go、去掉本机路径编译"
    assert '"--force", "--sign", "-", "--identifier", IDENTIFIER' in source, "引擎要用固定标识 ad-hoc 预签名"
    # ASCII、LF、两个空格，路径相对仓库根（CI 与 CONTRIBUTING 都在仓库根执行 shasum -c）。
    assert 'open(out + ".sha256", "w", encoding="ascii", newline="\\n")' in source, ".sha256 必须按 ASCII、LF 写"
    assert 'f.write("%s  dist/%s\\n" % (digest, os.path.basename(out)))' in source, ".sha256 的行格式变了"
    # --dev 先删再复制：原地覆盖已签名的 Mach-O，内核按旧缓存核对签名，下次执行会被直接 SIGKILL。
    dev = source[source.index("if args.dev:\n        step"):]
    assert dev.index("os.remove(dev)") < dev.index("shutil.copy2(outputs[0], dev)"), "--dev 要先删掉旧的 dist/szudesktop 再复制"


def test_build_refuses_before_building():
    # 不在 macOS 上时第一句就拒绝；在 macOS 上用一个同样会在同步页面之前就被拒绝的参数组合，不真的编译。
    args = ["--dev", "--arch", "arm64", "--arch", "amd64"] if sys.platform == "darwin" else []
    r = run_refusing([BUILD], BUILD, *args)
    want = "--dev 只能配一个 --arch" if sys.platform == "darwin" else "只能在 macOS 上构建"
    assert r.returncode == 1 and want in r.stdout, (r.returncode, r.stdout, r.stderr)
    assert "同步页面资源" not in r.stdout, "被拒绝前就开始同步页面了"


def test_keychain_suffix_matches_go():
    engine = load("smoke_macos_under_check", SMOKE_ENGINE)
    go = (ROOT / "internal" / "credential" / "keychain_namespace_test.go").read_text(encoding="utf-8")
    fixed = re.search(r'Setenv\("SZUNET_CONFIG_DIR", "(/tmp/szu-cfg/)"\)\s*\n\s*if got, want := keychainServiceName\(sessionServiceBaseForTest\), '
                      r'"szunet-session-test-([0-9a-f]{12})"', go)
    assert fixed, "keychain_namespace_test.go 里找不到 /tmp/szu-cfg/ 的已知答案"
    assert engine.keychain_suffix(fixed.group(1)) == fixed.group(2), "Python 与 Go 的钥匙串后缀规则不一致，冒烟清理会找错条目"
    # 同一个目录的不同写法得到同一个名字；不解析符号链接：/var 与 /private/var 是两个名字，冒烟必须用传给引擎的那个字符串算。
    assert engine.keychain_suffix("/tmp/szu-cfg") == engine.keychain_suffix("/tmp//szu-cfg/.") == fixed.group(2)
    assert engine.keychain_suffix("/var/folders/x") != engine.keychain_suffix("/private/var/folders/x")
    assert re.fullmatch(r"[0-9a-f]{12}", engine.keychain_suffix("/tmp/独立 配置"))


def test_dmg_pure_rules():
    dmg = load("smoke_dmg_under_check", SMOKE_DMG)
    real = ["before-quit", "prepare-sent", "prepared", "confirmed", "before-quit", "windows-closed", "engine-stopped"]
    assert dmg.trace_in_order(real), "真实退出的轨迹（confirmed 之后还有一次 before-quit）应当通过"
    assert not dmg.trace_in_order([name for name in real if name != "prepared"]), "缺了保存回执也通过了"
    assert not dmg.trace_in_order(["before-quit", "prepare-sent", "prepared", "windows-closed", "confirmed", "engine-stopped"]), \
        "先关窗后确认的乱序轨迹也通过了"
    assert not dmg.trace_in_order([]), "空轨迹也通过了"
    base = {"szuDesktop.app", "Applications"}
    assert dmg.volume_is_clean(base) and dmg.volume_is_clean(base | {".DS_Store", ".VolumeIcon.icns", ".background.tiff"})
    assert not dmg.volume_is_clean(base | {"README.txt"}), "卷上多出的文件没被发现"
    assert not dmg.volume_is_clean(base | {".hidden-payload"}), "卷上多出的隐藏文件没被发现"
    assert not dmg.volume_is_clean({"szuDesktop.app"}), "少了「应用程序」链接也通过了"
    # 证据会作为 CI artifact 上传：64 位十六进制的令牌要打码，别的十六进制串不动。
    token, other = "ab" * 32, "cd" * 31
    with tempfile.TemporaryDirectory(prefix="szu-check-macos-") as tmp:
        log = Path(tmp) / "evidence.log"
        log.write_text("token=%s\nsha=%s\nlonger=%s\n" % (token, other, "e" * 65), encoding="utf-8")
        dmg.redact(log)
        text = log.read_text(encoding="utf-8")
    assert token not in text and "<redacted>" in text and other in text and "e" * 65 in text, text


def test_smoke_scripts_refuse_without_local():
    for script in (SMOKE_ENGINE, SMOKE_DMG):
        r = run_refusing([SMOKE_ENGINE, SMOKE_DMG], script, "--arch", "arm64")
        want = "什么都没做" if sys.platform == "darwin" else "只能在 macOS 上运行"
        assert r.returncode != 0 and want in r.stderr, (script.name, r.returncode, r.stdout, r.stderr)
        assert "PASS" not in r.stdout, "%s 被拒绝前就开始核对了" % script.name


check("build-macos.py: engine identifier, arch map and signIgnore agree", test_build_constants)
check("build-macos.py: deletes old output first, signs, writes LF .sha256, --dev deletes before copy", test_build_source_rules)
check("build-macos.py: refuses bad invocations before syncing or building", test_build_refuses_before_building)
if POSIX:
    check("smoke scripts: keychain suffix equals the Go known answer (no symlink resolution)", test_keychain_suffix_matches_go)
    check("smoke_dmg.py: quit trace as a subsequence, volume whitelist, token redaction", test_dmg_pure_rules)
    check("smoke scripts: refuse to run on a non-runner host without --local", test_smoke_scripts_refuse_without_local)
else:
    print("SKIP 冒烟脚本的钥匙串规则、轨迹与白名单按 POSIX 路径写，只在 macOS 与 Linux 上核对")
print("%d macOS script checks passed" % count)
