FROM wcs-gui/ubuntu-base:22.04

RUN apt-get update && apt-get install -y --no-install-recommends filezilla \
    && rm -rf /var/lib/apt/lists/*

CMD ["filezilla"]
