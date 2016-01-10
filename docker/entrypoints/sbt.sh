#!/usr/bin/env bash

ln -sf /configs/etc/gu /etc/gu

cd /code

sbt "project $APP" "~ run 9000"
