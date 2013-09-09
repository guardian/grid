#!/usr/bin/env bash

ELASTICSEARCH_VERSION=0.90.3
ELASTICSEARCH_DIR=$(dirname $0)
TARGET=$ELASTICSEARCH_DIR/target

[ -d target ] && rm -rfv target
mkdir $TARGET
cd $TARGET

mkdir downloads
mkdir -p packages/media-api-elasticsearch

if wget -O downloads/elasticsearch.tar.gz https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-$ELASTICSEARCH_VERSION.tar.gz
then
    tar xfv downloads/elasticsearch.tar.gz -C downloads
    mv downloads/elasticsearch-* downloads/elasticsearch
    ./downloads/elasticsearch/bin/plugin -install elasticsearch/elasticsearch-cloud-aws/1.14.0
    ./downloads/elasticsearch/bin/plugin -install mobz/elasticsearch-head
    ./downloads/elasticsearch/bin/plugin -install lukas-vlcek/bigdesk
    ./downloads/elasticsearch/bin/plugin -install karmi/elasticsearch-paramedic
    cp ../elasticsearch.yml downloads/elasticsearch/config
    cp ../logging.yml downloads/elasticsearch/config
    cp ../elasticsearch.in.sh downloads/elasticsearch/bin
    cp ../elasticsearch.conf downloads

else
    echo 'Failed to download Elasticsearch'
    exit 1
fi

tar czfv packages/media-service-elasticsearch/elasticsearch.tar.gz -C downloads elasticsearch elasticsearch.conf logstash.jar logstash-shipper.conf logstash.conf
cp ../deploy.json .
zip -rv artifacts.zip packages/ deploy.json

echo "##teamcity[publishArtifacts '$(pwd)/artifacts.zip => .']"
