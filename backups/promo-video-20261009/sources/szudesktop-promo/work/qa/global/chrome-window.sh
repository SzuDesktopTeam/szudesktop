#!/bin/sh
# Test wrapper: system Chrome whose headless window is as large as the frame (default is 756×556,
# smaller than the emulated 1920×1080 viewport).
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@" --window-size=1920,1920
