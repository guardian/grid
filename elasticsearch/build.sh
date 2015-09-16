#!/usr/bin/env bash

ELASTICSEARCH_VERSION=1.7.1
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

    ./downloads/elasticsearch/bin/plugin -install elasticsearch/elasticsearch-cloud-aws/2.7.1
    ./downloads/elasticsearch/bin/plugin -install mobz/elasticsearch-head
    ./downloads/elasticsearch/bin/plugin -install com.gu/elasticsearch-cloudwatch/1.1
    ./downloads/elasticsearch/bin/plugin -install karmi/elasticsearch-paramedic

    cp ../elasticsearch.yml downloads/elasticsearch/config
    cp ../logging.yml downloads/elasticsearch/config
    cp ../elasticsearch.conf downloads
    cp -r ../scripts downloads/scripts
else
    echo 'Failed to download Elasticsearch'
    exit 1
fi

tar czfv packages/elasticsearch/elasticsearch.tar.gz -C downloads elasticsearch scripts elasticsearch.conf
cp ../deploy.json .
zip -rv artifacts.zip packages/ deploy.json

echo "##teamcity[publishArtifacts '$(pwd)/artifacts.zip => .']"
