FROM wcs-gui/ubuntu-base:22.04

# Microsoft 公式 APT リポジトリーからデスクトップ版 VS Code をインストールする
# https://code.visualstudio.com/docs/setup/linux
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg \
    && echo 'deb [signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/code stable main' \
        > /etc/apt/sources.list.d/vscode.list \
    && apt-get update && apt-get install -y --no-install-recommends code \
    && rm -rf /var/lib/apt/lists/*

# 日本語言語パックを同梱し、初回起動時にホームへコピーする
RUN code --no-sandbox --user-data-dir /tmp/vscode-install \
        --extensions-dir /opt/vscode-extensions \
        --install-extension MS-CEINTL.vscode-language-pack-ja \
    && rm -rf /tmp/vscode-install

# 共通ベースが noVNC と Mozc を起動し、一般ユーザーで VS Code を実行する。
# --wait で VS Code を閉じるまでコンテナーを動かす。
CMD ["sh", "-c", "mkdir -p /config/.vscode/extensions && cp -a -n /opt/vscode-extensions/. /config/.vscode/extensions/ && exec code --no-sandbox --wait --locale ja --user-data-dir /config/.config/Code --extensions-dir /config/.vscode/extensions /config"]
