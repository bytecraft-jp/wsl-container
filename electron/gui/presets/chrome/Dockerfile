FROM wcs-gui/ubuntu-base:22.04

RUN curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
    && apt-get update && apt-get install -y --no-install-recommends /tmp/chrome.deb \
    && rm -rf /tmp/chrome.deb /var/lib/apt/lists/*

# コンテナー内では Chrome のサンドボックスに必要な名前空間を作れないため --no-sandbox で起動する
CMD ["google-chrome", "--no-sandbox", "--no-first-run", "--password-store=basic"]
