#!/bin/zsh

set -o shwordsplit

API="https://api.media.local.dev-gutools.co.uk/management/healthcheck"
THRALL="https://thrall.media.local.dev-gutools.co.uk/management/healthcheck"
IMAGE_LOADER="https://loader.media.local.dev-gutools.co.uk/management/healthcheck"
KAHUNA="https://media.local.dev-gutools.co.uk/management/healthcheck"
CROPPER="https://cropper.media.local.dev-gutools.co.uk/management/healthcheck"
METADATA="https://media-metadata.local.dev-gutools.co.uk/management/healthcheck"
USAGE="https://media-usage.local.dev-gutools.co.uk/management/healthcheck"
COLLECTIONS="https://media-collections.local.dev-gutools.co.uk/management/healthcheck"
AUTH="https://media-auth.local.dev-gutools.co.uk/management/healthcheck"
LEASES="https://media-leases.local.dev-gutools.co.uk/management/healthcheck"
ADMIN_TOOLS="https://admin-tools.media.local.dev-gutools.co.uk/management/healthcheck"

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
