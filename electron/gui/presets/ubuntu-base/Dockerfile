# 日本語化した Ubuntu に、ブラウザーから操作するための画面 (TigerVNC + noVNC) と
# 日本語入力 (Fcitx5 + Mozc) だけを追加した共通ベースです。
# アプリのイメージは FROM でこれを指定し、アプリをインストールして CMD で起動コマンドを指定します。
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
# Docker 版 ubuntu はアプリの翻訳ファイルを入れない設定のため、日本語表示用にそれを外す
RUN sed -i '\|/usr/share/locale/|d' /etc/dpkg/dpkg.cfg.d/excludes \
    && apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg procps locales tzdata language-pack-ja \
        fonts-noto-cjk fonts-noto-color-emoji librsvg2-common \
        tigervnc-standalone-server novnc websockify openbox \
        dbus-x11 x11-utils x11-xkb-utils \
        fcitx5 fcitx5-mozc fcitx5-module-xorg \
        fcitx5-frontend-gtk2 fcitx5-frontend-gtk3 fcitx5-frontend-qt5 \
    && rm -rf /var/lib/apt/lists/*

RUN locale-gen ja_JP.UTF-8 \
    && ln -sf /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && echo Asia/Tokyo > /etc/timezone \
    && dbus-uuidgen > /etc/machine-id \
    && useradd --uid 1000 --create-home --home-dir /config --shell /bin/bash wcs

# 半角/全角キーで日本語入力を切り替える設定 (全ユーザーの既定値)
COPY fcitx5/ /etc/xdg/fcitx5/
COPY gui-session.sh /usr/local/bin/gui-session
RUN chmod 755 /usr/local/bin/gui-session

# ブラウザーは Windows の半角/全角キーを押すたびに Zenkaku / Hankaku と交互に送る。
# これらは X のキー配列になく、Xvnc が打鍵のたびに付け替えて取りこぼすため、
# noVNC から日本語配列にある Zenkaku_Hankaku (切り替えキー) として送らせる。
RUN sed -i -e 's/addStandard("Zenkaku", KeyTable.XK_Zenkaku)/addStandard("Zenkaku", KeyTable.XK_Zenkaku_Hankaku)/' \
           -e 's/addStandard("Hankaku", KeyTable.XK_Hankaku)/addStandard("Hankaku", KeyTable.XK_Zenkaku_Hankaku)/' \
        /usr/share/novnc/core/input/domkeytable.js \
    && test "$(grep -c 'KeyTable.XK_Zenkaku_Hankaku' /usr/share/novnc/core/input/domkeytable.js)" = 3

ENV LANG=ja_JP.UTF-8 LANGUAGE=ja_JP:ja TZ=Asia/Tokyo DISPLAY=:0 \
    GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx
WORKDIR /config
EXPOSE 5800
ENTRYPOINT ["/usr/local/bin/gui-session"]
