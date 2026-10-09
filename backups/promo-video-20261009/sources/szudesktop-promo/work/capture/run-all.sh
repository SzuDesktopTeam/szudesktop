#!/bin/zsh
# 重新采集全部真实应用画面 → assets/footage/。
# 前置（只写源码 worktree 的被忽略目录）：
#   cd /Users/alakazan/workplace/szudesktop-promo-src && python3 desktop/sync-assets.py && GOPROXY=off go build -o dist/promo/szudesktop ./desktop/cmd/szudesktop
set -e
cd "$(dirname "$0")"
rm -rf meta tmp ../../assets/footage
node cap-misc.mjs
node cap-focus.mjs
node cap-garden.mjs
node cap-notes.mjs
node cap-network.mjs
node cap-pet.mjs
node cap-scenes.mjs
node cap-extra.mjs
node build-manifest.mjs
