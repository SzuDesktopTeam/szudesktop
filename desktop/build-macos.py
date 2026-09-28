"""macOS 引擎一步到位：同步页面 → 按架构编译 → ad-hoc 签名 → 自检 → 写校验文件。

为什么要有这个脚本：和 build-windows.py 一样，页面要先同步进 go:embed 能看见的目录，
手敲容易漏一步；macOS 还多出签名这一步，Electron 打包时引擎按已签名的嵌套代码收进
.app（build-mac.mjs 用 signIgnore 不再重签），所以这里签好、验好，包里那份才与
冒烟通过的这份逐字节一致。

用法:
    python3 desktop/build-macos.py                # arm64 与 amd64 各编一份
    python3 desktop/build-macos.py --arch arm64   # 只编一个架构
    python3 desktop/build-macos.py --dev          # 只编本机架构，并复制成 dist/szudesktop 供开发模式使用

产物: dist/szudesktop-darwin-<arch> 及同名 .sha256（开发模式另有 dist/szudesktop）。
"""
import argparse
import hashlib
import os
import shutil
import subprocess
import sys

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

DESKTOP = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(DESKTOP)
DIST = os.path.join(ROOT, "dist")
MASTER = os.path.join(DESKTOP, "index.html")
COPIES = (os.path.join(DESKTOP, "assets", "index.html"),
          os.path.join(DESKTOP, "internal", "ui", "assets", "index.html"))
IDENTIFIER = "com.szudesktop.engine"
# Go 的架构名 → lipo 报出的 Mach-O 架构名
LIPO = {"arm64": "arm64", "amd64": "x86_64"}


def step(msg):
    print("\n>> " + msg)


def fail(msg, code=1):
    print("!! " + msg)
    sys.exit(code)


def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def read_version():
    """版本号只有一个来源：internal/version/VERSION（Go 用 go:embed 嵌入同一个文件）。"""
    ver = open(os.path.join(ROOT, "internal", "version", "VERSION"), encoding="utf-8").read().strip()
    if not ver:
        fail("internal/version/VERSION 是空的，编出来的引擎版本号会不对")
    return ver


def native_arch():
    # 不看 platform.machine()：Rosetta 下运行的 Python 会报 x86_64。
    r = run(["/usr/sbin/sysctl", "-n", "hw.optional.arm64"])
    return "arm64" if r.returncode == 0 and r.stdout.strip() == "1" else "amd64"


def can_run(arch):
    """本机能否执行该架构：原生架构总能跑；Apple 芯片上的 amd64 要装了 Rosetta。"""
    if arch == native_arch():
        return True
    if arch == "amd64":
        return run(["/usr/bin/arch", "-x86_64", "/usr/bin/true"]).returncode == 0
    return False


def build(arch, version):
    out = os.path.join(DIST, "szudesktop-darwin-" + arch)
    step("编译 darwin/%s" % arch)
    # 先删旧产物：go build 发现 build ID 没变就不重写，上一次签过名的文件会原样留着，
    # 后面的签名与校验就核对不到这次编译的结果。
    for path in (out, out + ".sha256"):
        if os.path.exists(path):
            os.remove(path)
    env = dict(os.environ, CGO_ENABLED="0", GOOS="darwin", GOARCH=arch)
    r = subprocess.run(["go", "build", "-trimpath", "-ldflags", "-s -w", "-o", out, "./desktop/cmd/szudesktop"],
                       cwd=ROOT, env=env)
    if r.returncode != 0:
        fail("编译失败", r.returncode)
    os.chmod(out, 0o755)

    # 链接器自带的 ad-hoc 签名以文件名为标识；换成固定标识，外层 .app 的签名按它记录嵌套代码。
    r = run(["/usr/bin/codesign", "--force", "--sign", "-", "--identifier", IDENTIFIER, out])
    if r.returncode != 0:
        fail("codesign 签名失败：" + r.stderr.strip())
    r = run(["/usr/bin/codesign", "--verify", "--strict", out])
    if r.returncode != 0:
        fail("codesign 校验失败：" + r.stderr.strip())
    info = run(["/usr/bin/codesign", "-dv", out]).stderr
    if "Signature=adhoc" not in info or "Identifier=" + IDENTIFIER not in info:
        fail("签名不是预期的 ad-hoc / %s：\n%s" % (IDENTIFIER, info))

    archs = run(["/usr/bin/lipo", "-archs", out]).stdout.split()
    if archs != [LIPO[arch]]:
        fail("%s 应只含 %s，实际 %s" % (out, LIPO[arch], archs))

    if can_run(arch):
        cmd = [out, "--version"] if arch == native_arch() else ["/usr/bin/arch", "-x86_64", out, "--version"]
        r = run(cmd, timeout=30)
        if r.returncode != 0 or version not in r.stdout:
            fail("%s 自报版本不对（应含 %s）：%s%s" % (" ".join(cmd), version, r.stdout, r.stderr))
        print("   %s" % r.stdout.strip())
    else:
        print("   本机无法执行 %s，跳过 --version 自检" % arch)

    digest = sha256(out)
    # ASCII、LF、两个空格。裸引擎不作为发布附件，校验文件只给 CI 与本地验收在仓库根目录
    # 核对（shasum -a 256 -c dist/szudesktop-darwin-*.sha256），所以写相对仓库根的路径，
    # 不像发布附件那样只写文件名。
    with open(out + ".sha256", "w", encoding="ascii", newline="\n") as f:
        f.write("%s  dist/%s\n" % (digest, os.path.basename(out)))
    print("   %s  %.1f MB  %s  sha256 %s" % (os.path.relpath(out, ROOT), os.path.getsize(out) / 1024 / 1024,
                                            LIPO[arch], digest[:16]))
    return out


def main():
    parser = argparse.ArgumentParser(description="编译并 ad-hoc 签名 macOS 引擎")
    parser.add_argument("--arch", choices=sorted(LIPO), action="append",
                        help="只编指定架构，可重复；默认 arm64 与 amd64 都编（--dev 时默认本机架构）")
    parser.add_argument("--dev", action="store_true", help="只编一个架构，并复制为 dist/szudesktop 供开发模式使用")
    args = parser.parse_args()
    if sys.platform != "darwin":
        fail("macOS 引擎只能在 macOS 上构建（签名要用 codesign，自检要用 lipo）")
    archs = args.arch or ([native_arch()] if args.dev else ["arm64", "amd64"])
    archs = list(dict.fromkeys(archs))
    if args.dev and len(archs) != 1:
        fail("--dev 只能配一个 --arch")

    step("同步页面资源")
    r = subprocess.run([sys.executable, os.path.join(DESKTOP, "sync-assets.py")], cwd=ROOT)
    if r.returncode != 0:
        fail("sync-assets.py 失败", r.returncode)
    version = read_version()
    os.makedirs(DIST, exist_ok=True)

    outputs = [build(arch, version) for arch in archs]

    # 主副本与两份生成副本必须逐字节一致：能抓出「改了页面忘了同步」，编进去的是旧页面。
    step("校验内嵌页面")
    want = sha256(MASTER)
    for copy in COPIES:
        if not os.path.exists(copy) or sha256(copy) != want:
            fail("%s 与 desktop/index.html 不一致，编出来的引擎里会是旧页面" % os.path.relpath(copy, ROOT))
    print("   desktop/index.html 与两份副本一致  %s" % want[:10])

    if args.dev:
        step("复制开发模式引擎")
        dev = os.path.join(DIST, "szudesktop")
        # 先删再复制：原地覆盖已签名的 Mach-O，内核按旧 inode 缓存的签名对不上，
        # 下次执行会被直接 SIGKILL。copy2 连同权限一起复制；签名在文件内部，复制后仍有效。
        if os.path.lexists(dev):
            os.remove(dev)
        shutil.copy2(outputs[0], dev)
        if sha256(dev) != sha256(outputs[0]):
            fail("dist/szudesktop 与 %s 不一致" % os.path.basename(outputs[0]))
        print("   dist/szudesktop ← %s" % os.path.basename(outputs[0]))
        print("\n完成。开发模式启动（首次先在 desktop/electron 里 npm ci）:")
        print("   cd desktop/electron && npm start")
    else:
        print("\n完成。")


if __name__ == "__main__":
    main()
