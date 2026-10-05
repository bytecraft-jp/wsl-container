FROM wcs-gui/ubuntu-base:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice libreoffice-gtk3 libreoffice-l10n-ja libreoffice-help-ja \
    && rm -rf /var/lib/apt/lists/*

CMD ["libreoffice", "--norestore"]
