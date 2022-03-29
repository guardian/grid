FROM mozilla/sbt:8u292_1.5.7

RUN apt-get -y update

RUN apt-get -y install graphicsmagick
RUN apt-get -y install graphicsmagick-imagemagick-compat
RUN apt-get -y install exiftool

ENTRYPOINT ["sbt"]
