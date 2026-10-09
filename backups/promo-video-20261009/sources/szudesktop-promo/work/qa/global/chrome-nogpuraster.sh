#!/bin/sh
# Test wrapper: the system Chrome with GPU rasterization disabled (tiles are rasterized on the CPU,
# compositing stays on the GPU). Remotion passes all its own flags through "$@".
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --disable-gpu-rasterization "$@"
