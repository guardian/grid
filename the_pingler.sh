#!/bin/zsh

set -o shwordsplit

API="http://localhost:9001/management/healthcheck"
THRALL="http://localhost:9002/"
IMAGE_LOADER="http://localhost:9003/management/healthcheck"
FTP_WATCHER="http://localhost:9004/"
KAHUNA="http://localhost:9005/management/healthcheck"
CROPPER="http://localhost:9006/management/healthcheck"
METADATA="http://localhost:9007/management/healthcheck"
USAGE="https://localhost:9009/"
COLLECTIONS="https://localhost:9010/"

lu="$IMAGE_LOADER $CROPPER $METADATA $THRALL $FTP_WATCHER $KAHUNA $API $USAGE"

echo "You have started the Pingler!"
echo

while true; do
    echo "\033[1;95mPingling!\033[m\n"
    for URL in $lu
    do
        STATUS=`curl --fail -s -w "%{http_code} %{url_effective}\\n" $URL  -o /dev/null`

        if [ "$?" -eq "0" ]
        then
            echo "\033[1;92m$STATUS\033[m\n"
        else
            echo "\033[1;41m$STATUS\033[m\n"
        fi
    done
    sleep 2
done
