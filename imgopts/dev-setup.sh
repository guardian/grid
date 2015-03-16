#!/usr/bin/env bash

NGINX_VERSION=1.7.10
wget http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz
tar -xvzf nginx-${NGINX_VERSION}.tar.gz
cd nginx-${NGINX_VERSION}/
./configure \
  --sbin-path=/usr/sbin/nginx \
  --conf-path=/etc/nginx/nginx.conf \
  --with-http_ssl_module \
  --with-http_image_filter_module \

make
sudo make install

rm -rf ./nginx-${NGINX_VERSION}*
