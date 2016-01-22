#!/usr/bin/env bash

cp /configs/imgops/nginx.conf /etc/nginx/nginx.conf

nginx -g "daemon off;"
