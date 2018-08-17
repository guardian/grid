#!/usr/bin/env bash

MASTER=$(curl -s http://localhost:9200/_cat/master?h=ip)
MY_IP=$(curl -s http://instance-data/latest/meta-data/local-ipv4)

if [ $MY_IP = $MASTER ]; then
    DATE=$(date +%Y-%m-%d-%T)
    curl -s -XPUT http://localhost:9200/_snapshot/s3/${DATE}?wait_for_completion=true
fi
