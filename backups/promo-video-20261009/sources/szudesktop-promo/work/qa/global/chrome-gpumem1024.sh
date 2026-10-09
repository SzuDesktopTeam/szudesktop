#!/bin/sh
# Test wrapper: system Chrome with a per-renderer tile-memory budget of 1024 MB (Remotion passes 4096;
# the later switch wins).
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@" --force-gpu-mem-available-mb=1024
