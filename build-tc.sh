#!/usr/bin/env bash

PROJECT=$1

if [ -z ${PROJECT} ];
then
    echo "Please specify a project."
    echo "Usage: $0 <auth | collections | cropper | image-loader | kahuna | leases | media-api | metadata-editor | thrall | usage>"
    exit 1
fi

java -Xmx1024m \
    -XX:MaxPermSize=256m \
    -XX:ReservedCodeCacheSize=128m \
    -XX:+CMSClassUnloadingEnabled \
    -Dsbt.log.noformat=true \
    -jar sbt-launch.jar \
    "set scalaVersion:=\"2.11.6\"" clean compile "project ${PROJECT}" test riffRaffNotifyTeamcity
