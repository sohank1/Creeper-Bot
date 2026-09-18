#!/bin/sh
set -eu

if [ "${FORTNITE_SPRITE_BROWSER_HEADFUL:-false}" = "true" ] && [ -z "${DISPLAY:-}" ]; then
    export DISPLAY=:99
    Xvfb "$DISPLAY" -screen 0 1365x900x24 -nolisten tcp >/dev/null 2>&1 &
    xvfb_pid=$!

    display_ready=false
    attempt=0
    while [ "$attempt" -lt 50 ]; do
        if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
            display_ready=true
            break
        fi
        if ! kill -0 "$xvfb_pid" 2>/dev/null; then
            echo "Xvfb exited before the display became ready." >&2
            exit 1
        fi
        attempt=$((attempt + 1))
        sleep 0.1
    done

    if [ "$display_ready" != "true" ]; then
        echo "Timed out waiting for Xvfb display $DISPLAY." >&2
        exit 1
    fi
fi

exec "$@"
