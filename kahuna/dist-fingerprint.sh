#!/bin/sh

md5hash() {
    if hash md5sum 2>/dev/null;
    then
        md5sum "$@"
    else
        # md5sum isn't available on OSX
        md5 "$@"
    fi
}

sed -i -- "s/\/build\.js/\/`md5hash public/js/dist/build.js | awk '{print $1}'`-build\.js/g" public/config.js
