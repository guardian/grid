FROM ubuntu:noble

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get --yes update && apt-get --yes install \
    nginx \
    libnginx-mod-http-image-filter

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
