#!/usr/bin/env bash

cp -r /configs/nginx/sites-enabled /etc/nginx/sites-enabled

cp /configs/nginx/ssl/media-service.crt /etc/nginx/media-service.crt
cp /configs/nginx/ssl/media-service.key /etc/nginx/media-service.key

nginx -g "daemon off;"
