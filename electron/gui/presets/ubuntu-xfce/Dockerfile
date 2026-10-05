FROM wcs-gui/ubuntu-base:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        xfce4 xfce4-terminal thunar mousepad \
    && rm -rf /var/lib/apt/lists/*

ENV GUI_WINDOW_MANAGER=none
CMD ["startxfce4"]
