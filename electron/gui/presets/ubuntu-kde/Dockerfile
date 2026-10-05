FROM wcs-gui/ubuntu-base:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        plasma-desktop konsole dolphin kate language-pack-kde-ja \
    && rm -rf /var/lib/apt/lists/*

# コンテナーには systemd がないため、Plasma を systemd なしで起動する
RUN printf '[General]\nsystemdBoot=false\n' > /etc/xdg/startkderc

ENV GUI_WINDOW_MANAGER=none
CMD ["startplasma-x11"]
