#!/usr/bin/env bash

ELASTICSEARCH_VERSION=1.7.1
ELASTICSEARCH_DIR=$(dirname $0)
TARGET=$ELASTICSEARCH_DIR/target

[ -d target ] && rm -rfv target
mkdir $TARGET
cd $TARGET

mkdir downloads
mkdir -p packages/elasticsearch

SORT_PLUGIN_URI="https://github.com/guardian/grid-supplier-weight-sort/releases/download/v1.0/grid-supplier-weight-sort-0.1.0.zip"

wget $SORT_PLUGIN_URI -O /var/tmp/grid-supplier-weight-sort-0.1.0.zip

if wget -nv -O downloads/elasticsearch.tar.gz https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-$ELASTICSEARCH_VERSION.tar.gz
then
    tar xfv downloads/elasticsearch.tar.gz -C downloads
    mv downloads/elasticsearch-* downloads/elasticsearch

    ./downloads/elasticsearch/bin/plugin -install elasticsearch/elasticsearch-cloud-aws/2.7.1
    ./downloads/elasticsearch/bin/plugin -install mobz/elasticsearch-head
    ./downloads/elasticsearch/bin/plugin -install com.gu/elasticsearch-cloudwatch/1.1
    ./downloads/elasticsearch/bin/plugin -install karmi/elasticsearch-paramedic
    ./downloads/elasticsearch/bin/plugin -url file:///var/tmp/grid-supplier-weight-sort-0.1.0.zip -install grid-supplier-weight-sort

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
