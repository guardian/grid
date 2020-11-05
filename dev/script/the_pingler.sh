#!/bin/zsh

set -o shwordsplit

API="https://api.media.example.com/management/healthcheck"
THRALL="https://thrall.media.example.com/management/healthcheck"
IMAGE_LOADER="https://loader.media.example.com/management/healthcheck"
KAHUNA="https://media.example.com/management/healthcheck"
CROPPER="https://cropper.media.example.com/management/healthcheck"
METADATA="https://media-metadata.example.com/management/healthcheck"
USAGE="https://media-usage.example.com/management/healthcheck"
COLLECTIONS="https://media-collections.example.com/management/healthcheck"
AUTH="https://media-auth.example.com/management/healthcheck"
LEASES="https://media-leases.example.com/management/healthcheck"
ADMIN_TOOLS="https://admin-tools.media.example.com/management/healthcheck"

lu="$COLLECTIONS $IMAGE_LOADER $CROPPER $METADATA $THRALL $KAHUNA $API $USAGE $AUTH $LEASES $ADMIN_TOOLS"

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
