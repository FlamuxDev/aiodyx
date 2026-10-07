#!/bin/bash
# usage: shot.sh <url-path> <width> <height> <out>
brave --headless=new --disable-gpu --no-sandbox --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=3000 --window-size=$2,$3 --screenshot="$4" "http://localhost:4321$1" >/dev/null 2>&1
