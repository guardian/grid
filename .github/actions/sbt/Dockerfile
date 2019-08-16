FROM adoptopenjdk:8-jdk-openj9

RUN apt-get -y update

RUN apt-get -y install gnupg
RUN apt-get -y install graphicsmagick
RUN apt-get -y install graphicsmagick-imagemagick-compat
RUN apt-get -y install exiftool

RUN echo "deb https://dl.bintray.com/sbt/debian /" | tee -a /etc/apt/sources.list.d/sbt.list
RUN apt-key adv --keyserver hkps://keyserver.ubuntu.com:443 --recv 2EE0EA64E40A89B84B2DF73499E82A75642AC823
RUN apt-get -y update
RUN apt-get -y install sbt

ENTRYPOINT ["sbt"]
