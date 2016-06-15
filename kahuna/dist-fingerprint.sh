#!/bin/sh

sed -i -- "s/\/build\.js/\/`md5sum public/js/dist/build.js | awk '{print $1}'`-build\.js/g" public/config.js
