FROM wcs-gui/ubuntu-base:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        ubuntu-session yaru-theme-gtk yaru-theme-icon yaru-theme-gnome-shell \
        gnome-shell-extension-ubuntu-dock gnome-shell-extension-appindicator \
        gnome-control-center gnome-terminal nautilus gedit language-pack-gnome-ja \
    && rm -rf /var/lib/apt/lists/*

# コンテナーには systemd (logind)・電源・USB 管理がないため、
# - インストール時に作られた /run/systemd/seats を消す (残っていると GNOME Shell が logind を探して起動に失敗する)
# - 電源・USB 管理を必須から外した Ubuntu セッションを用意する
RUN rm -rf /run/systemd/seats \
    && sed -e 's/org\.gnome\.SettingsDaemon\.Power;//' -e 's/org\.gnome\.SettingsDaemon\.UsbProtection;//' \
        /usr/share/gnome-session/sessions/ubuntu.session > /usr/share/gnome-session/sessions/ubuntu-vnc.session

ENV GUI_WINDOW_MANAGER=none XDG_SESSION_TYPE=x11 XDG_CURRENT_DESKTOP=ubuntu:GNOME GNOME_SHELL_SESSION_MODE=ubuntu
CMD ["gnome-session", "--builtin", "--session=ubuntu-vnc"]
