#!/usr/bin/env bash

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
if [ -f ./nginx/logs/nginx.pid ]; then
    $SCRIPT_DIR/nginx/objs/nginx -s stop
fi
$SCRIPT_DIR/nginx/objs/nginx
