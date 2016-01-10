#!/usr/bin/env bash

ln -sf /configs/nginx/sites-enabled /etc/nginx/sites-enabled

ln -sf /configs/.gu/grid/ssl/media-service.crt /etc/nginx/media-service.crt
ln -sf /configs/.gu/grid/ssl/media-service.key /etc/nginx/media-service.key

nginx -g "daemon off;"
