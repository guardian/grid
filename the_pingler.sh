#!/bin/zsh

set -o shwordsplit

API="http://localhost:9001/management/healthcheck"
THRALL="http://localhost:9002/"
IMAGE_LOADER="http://localhost:9003/management/healthcheck"
KAHUNA="http://localhost:9005/management/healthcheck"
CROPPER="http://localhost:9006/management/healthcheck"
METADATA="http://localhost:9007/management/healthcheck"
USAGE="http://localhost:9009/management/healthcheck"
COLLECTIONS="http://localhost:9010/management/healthcheck"
AUTH="http://localhost:9011/management/healthcheck"
LEASES="http://localhost:9012/management/healthcheck"

lu="$COLLECTIONS $IMAGE_LOADER $CROPPER $METADATA $THRALL $KAHUNA $API $USAGE $AUTH $LEASES"

echo "You have started the Pingler!"
echo

while true; do
    echo "\033[1;95mPingling!\033[m\n"
    for URL in $lu
    do
        STATUS=`curl --fail -s -w "%{http_code} %{url_effective}\\n" $URL -o /dev/null`

        if [ "$?" -eq "0" ]
        then
            echo "\033[1;92m$STATUS\033[m\n"
        else
            echo "\033[1;41m$STATUS\033[m\n"
        fi
    done
    sleep 2
done
