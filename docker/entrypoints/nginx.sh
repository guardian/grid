#!/usr/bin/env bash

cp /configs/etc/nginx/nginx.conf /etc/nginx/nginx.conf
cp -r /configs/etc/nginx/sites-enabled /etc/nginx/sites-enabled

cp /configs/etc/nginx/ssl/media-service.crt /etc/nginx/media-service.crt
cp /configs/etc/nginx/ssl/media-service.key /etc/nginx/media-service.key

cp /configs/etc/nginx/ssl/star.media-service.crt /etc/nginx/star.media-service.crt
cp /configs/etc/nginx/ssl/star.media-service.key /etc/nginx/star.media-service.key

nginx -g "daemon off;"
