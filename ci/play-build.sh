#!/usr/bin/env bash

# Generic script to build a Play app
# NB we use `riffRaffUpload` over `riffRaffNotifyTeamcity` because we want to specify the project name

PROJECT=$1

if [ -z ${PROJECT} ];
then
    echo "ERROR! PROJECT not specified."
    echo "USAGE: $0 <PROJECT>"
    echo "PROJECT is one of:"
    echo "  - auth"
    echo "  - collections"
    echo "  - cropper"
    echo "  - image-loader"
    echo "  - kahuna"
    echo "  - leases"
    echo "  - media-api"
    echo "  - metadata-editor"
    echo "  - thrall"
    echo "  - usage"
    exit 1
fi

pushd ..

echo "Building $PROJECT"

java -Xmx2048m \
    -XX:ReservedCodeCacheSize=128m \
    -XX:+CMSClassUnloadingEnabled \
    -Dsbt.log.noformat=true \
    clean compile "project ${PROJECT}" test riffRaffUpload

popd
