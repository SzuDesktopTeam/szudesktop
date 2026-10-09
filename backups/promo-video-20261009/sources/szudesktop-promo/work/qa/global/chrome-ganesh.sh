#!/bin/sh
# Test wrapper: system Chrome with Skia Graphite disabled (Ganesh GPU backend instead).
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@" --disable-skia-graphite
