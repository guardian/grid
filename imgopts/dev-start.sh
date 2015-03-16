#!/usr/bin/env bash

if [ -f ./nginx/logs/nginx.pid ]; then
    nginx/objs/nginx -s stop
fi
nginx/objs/nginx
