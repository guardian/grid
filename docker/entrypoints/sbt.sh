#!/usr/bin/env bash

cp -r /configs/etc/gu /etc/gu

cd /code

./sbt "project $APP" "~ run 9000"
