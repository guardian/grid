FROM debian:jessie
MAINTAINER The Guardian

RUN apt-get --yes update && apt-get --yes install \
    nginx \
    nginx-extras


# forward request and error logs to docker log collector
RUN ln -sf /dev/stdout /var/log/nginx/access.log
RUN ln -sf /dev/stderr /var/log/nginx/error.log

VOLUME ["/var/cache/nginx"]

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
