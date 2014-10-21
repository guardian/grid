#!/usr/bin/env bash

ELASTICSEARCH_VERSION=1.3.4
ELASTICSEARCH_DIR=$(dirname $0)
TARGET=$ELASTICSEARCH_DIR/target

[ -d target ] && rm -rfv target
mkdir $TARGET
cd $TARGET

mkdir downloads
mkdir -p packages/elasticsearch

if wget -nv -O downloads/elasticsearch.tar.gz https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-$ELASTICSEARCH_VERSION.tar.gz
then
    tar xfv downloads/elasticsearch.tar.gz -C downloads
    mv downloads/elasticsearch-* downloads/elasticsearch
    ./downloads/elasticsearch/bin/plugin -install elasticsearch/elasticsearch-cloud-aws/2.3.0
    ./downloads/elasticsearch/bin/plugin -install mobz/elasticsearch-head
    ./downloads/elasticsearch/bin/plugin -install lukas-vlcek/bigdesk
    ./downloads/elasticsearch/bin/plugin -install karmi/elasticsearch-paramedic
    ./downloads/elasticsearch/bin/plugin -install com.yakaz.elasticsearch.plugins/elasticsearch-action-updatebyquery/2.2.0
    cp ../elasticsearch.yml downloads/elasticsearch/config
    cp ../logging.yml downloads/elasticsearch/config
    cp ../elasticsearch.conf downloads
else
    echo 'Failed to download Elasticsearch'
    exit 1
fi

tar czfv packages/elasticsearch/elasticsearch.tar.gz -C downloads elasticsearch elasticsearch.conf
cp ../deploy.json .
zip -rv artifacts.zip packages/ deploy.json

echo "##teamcity[publishArtifacts '$(pwd)/artifacts.zip => .']"
