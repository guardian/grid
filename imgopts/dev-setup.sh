#!/usr/bin/env bash

if [ $# -lt 1 ]
then
    echo "usage: dev-setup.sh <DEV_IMAGE_BUCKET>"
    echo
    echo "⚡ Pro tip⚡ : You can get your image bucket name by running"
    echo
    echo "   $ aws s3 ls | grep {{DEV_USERNAME}}-imagebucket"
    echo
    exit 1
fi

NGINX_VERSION=1.7.10
NGINX_LOCATION=$PWD/nginx

# preclean
rm -rf ./nginx-${NGINX_VERSION}
rm -rf $NGINX_LOCATION

# unpack
wget http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz
tar -xvzf nginx-${NGINX_VERSION}.tar.gz

# link up
ln -s ./nginx-${NGINX_VERSION} $NGINX_LOCATION

# compile
pushd $NGINX_LOCATION
./configure \
  --prefix=$NGINX_LOCATION \
  --with-http_ssl_module \
  --with-http_image_filter_module

make

# logs
mkdir logs
chmod +w logs
touch logs/access.log
touch logs/error.log

popd

# replace the {{BUCKET}} variable with the supplied bucket name
yes | rm imgopts.conf
sed -e 's/{{BUCKET}}/'$1'/g' imgopts.template.conf > imgopts.conf

# let our own conf usurp the default
yes | rm $NGINX_LOCATION/conf/nginx.conf

ln -s $PWD/nginx.conf $NGINX_LOCATION/conf/nginx.conf
ln -s $PWD/imgopts.conf $NGINX_LOCATION/conf/imgopts.conf

# postclean
yes | rm nginx-${NGINX_VERSION}.tar.gz*

