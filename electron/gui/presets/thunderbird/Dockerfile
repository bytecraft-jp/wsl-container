FROM wcs-gui/ubuntu-base:22.04

RUN apt-get update && apt-get install -y --no-install-recommends thunderbird thunderbird-locale-ja \
    && rm -rf /var/lib/apt/lists/*
# 表示言語を日本語にする
RUN mkdir -p /etc/thunderbird/policies \
    && echo '{"policies": {"RequestedLocales": ["ja"]}}' > /etc/thunderbird/policies/policies.json

CMD ["thunderbird"]
