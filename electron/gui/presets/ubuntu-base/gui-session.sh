#!/bin/bash
# 画面 (Xvnc)・ブラウザー接続 (noVNC, ポート 5800)・日本語入力 (Fcitx5) を起動し、
# その上で引数 (各イメージの CMD) のアプリを一般ユーザー wcs で実行します。
# アプリが終了するとコンテナーも終了します。
set -euo pipefail

if [[ $(id -u) -eq 0 ]]; then
    # 新しい名前付きボリュームは root 所有で作られるため、ホームの所有者だけ直す
    chown wcs:wcs /config
    rm -f /tmp/.X0-lock /tmp/.X11-unix/X0 /run/dbus/pid
    mkdir -p /run/dbus /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
    dbus-daemon --system --fork
    exec runuser -u wcs -- "$0" "$@"
fi

export XDG_RUNTIME_DIR=/tmp/runtime-wcs
mkdir -p -m 700 "$XDG_RUNTIME_DIR"

Xtigervnc :0 -geometry 1920x1080 -depth 24 -rfbport 5900 -localhost=1 \
    -SecurityTypes None -AlwaysShared -nolisten tcp &
for _ in {1..100}; do xdpyinfo >/dev/null 2>&1 && break; sleep 0.1; done
setxkbmap -layout jp
websockify --web /usr/share/novnc 5800 127.0.0.1:5900 &

# デスクトップ環境のイメージは GUI_WINDOW_MANAGER=none にして自前のウィンドウマネージャーを使う
exec dbus-run-session -- bash -c '
    dbus-update-activation-environment --all
    fcitx5 -d
    [[ ${GUI_WINDOW_MANAGER:-openbox} == none ]] || openbox &
    exec "$@"' gui-session "$@"
