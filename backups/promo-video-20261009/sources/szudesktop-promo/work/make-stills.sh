#!/bin/bash
# Export one still per second from each finished cut + build a contact sheet per cut.
set -e
ROOT=/Users/alakazan/workplace/szudesktop-promo
CD=$ROOT/video/node_modules/@remotion/compositor-darwin-arm64
export DYLD_LIBRARY_PATH=$CD
for cut in ${CUTS:-16x9 9x16}; do
  IN=$ROOT/out/szudesktop-promo-$cut.mp4
  OUT=$ROOT/work/stills/$cut
  rm -rf "$OUT"; mkdir -p "$OUT"
  DUR=$([ $cut = 16x9 ] && echo 60 || echo 30)
  for ((t=0; t<DUR; t++)); do
    f=$(printf "%s/%s_t%02ds.png" "$OUT" "$cut" "$t")
    "$CD/ffmpeg" -v error -ss $t -i "$IN" -frames:v 1 -y "$f"
  done
  # last frame (59.983 s / 29.983 s) as well
  f=$(printf "%s/%s_t%02d.983s_last.png" "$OUT" "$cut" $((DUR-1)))
  "$CD/ffmpeg" -v error -sseof -0.05 -i "$IN" -frames:v 1 -y "$f"
  /opt/miniconda3/bin/python3 $ROOT/work/contact.py "$OUT" "$ROOT/work/stills/contact-$cut.jpg" $cut
done
