#!/usr/bin/env bash

green='\x1B[0;32m'
red='\x1B[0;31m'
plain='\x1B[0m' # No Color

isInstalled() {
  hash "$1" 2>/dev/null
}

checkRequirement() {
    if ! isInstalled $1; then
        echo -e "${red}[MISSING DEPENDENCY] $1 not found. Please install $1${plain}"
        exit 1
    fi
}

checkRequirements() {
    # server side
    checkRequirement java
    checkRequirement sbt

    # client side
    checkRequirement npm

    # elasticsearch and imgops (image resizer)
    checkRequirement docker

    # image libraries
    checkRequirement gm # GraphicsMagick
    checkRequirement imagemagick #ImageMagick
    checkRequirement convert
    checkRequirement pngquant

    # other
    checkRequirement nginx
    checkRequirement jq
    checkRequirement aws
}

setupImgops() {
    if [ ! -f ./imgops/dev/nginx.conf ]; then
        bucket=`bash get-stack-resource.sh ImageBucket`
        sed -e 's/{{BUCKET}}/'${bucket}'/g' ./imgops/dev/nginx.conf.template > ./imgops/dev/nginx.conf
    fi
}

startDockerContainers() {
    docker-compose up -d
}

startPlayApps() {
    sbt runAll
}

main() {
    checkRequirements
    setupImgops
    startDockerContainers
    startPlayApps
}

main
