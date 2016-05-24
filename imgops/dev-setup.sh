#!/usr/bin/env bash

if [ $# -lt 2 ]
then
    echo "usage: dev-setup.sh <DEV_IMAGE_BUCKET> <DEV_OPTIMISED_PNG_BUCKET>"
    echo
    echo "⚡ Pro tip⚡ : You can get your image bucket name by running"
    echo
    echo "   $ aws s3 ls | grep {{DEV_USERNAME}}-imagebucket"
    echo
    exit 1
fi

NGINX_LOCATION=$(nginx -V 2>&1 | grep "configure arguments:" | sed 's/[^*]*conf-path=\([^ ]*\)\/nginx\.conf.*/\1/g')

echo $NGINX_LOCATION

# replace the {{BUCKET}} variable with the supplied bucket name
rm -f $NGINX_LOCATION/sites-enabled/media-service-imgops.conf
sed -e 's/{{BUCKET}}/'$1'/;s/{{OPTIMISED_PNG_BUCKET}}/'$2'/g' imgops.template.conf > $NGINX_LOCATION/sites-enabled/media-service-imgops.conf

