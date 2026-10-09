#!/bin/bash
# 等横版渲染结束 → 审片扫描 → 渲染竖版 → 扫描 → 每秒抽帧拼版
ROOT=/Users/alakazan/workplace/szudesktop-promo
cd $ROOT/video
while pgrep -f "render.mjs --comp Main16x9" >/dev/null; do sleep 20; done
echo "== 16x9 render done $(date +%H:%M)"; tail -5 $ROOT/work/render-final-16x9.log
/opt/miniconda3/bin/python3 $ROOT/work/qa/global/audit.py 16x9 > $ROOT/work/audit-final-16x9.log 2>&1; echo "audit16 exit=$?"; tail -15 $ROOT/work/audit-final-16x9.log
npm run render:9x16 > $ROOT/work/render-final-9x16.log 2>&1; echo "== 9x16 render exit=$? $(date +%H:%M)"; tail -5 $ROOT/work/render-final-9x16.log
/opt/miniconda3/bin/python3 $ROOT/work/qa/global/audit.py 9x16 > $ROOT/work/audit-final-9x16.log 2>&1; echo "audit9 exit=$?"; tail -15 $ROOT/work/audit-final-9x16.log
bash $ROOT/work/make-stills.sh > $ROOT/work/make-stills-final.log 2>&1; echo "stills exit=$? $(date +%H:%M)"
