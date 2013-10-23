#!/bin/sh

ELASTICSEARCH_VERSION=0.90.5
ELASTICSEARCH_DIR=$(dirname $0)

if [ -d "$ELASTICSEARCH_DIR/elasticsearch" ]; then
  echo "It looks like you've already downloaded and installed elastic search"
  echo "Start it with $ELASTICSEARCH_DIR/dev-start.sh"
  exit 0
fi

DOWNLOAD_URI="https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-$ELASTICSEARCH_VERSION.tar.gz"

cd $ELASTICSEARCH_DIR

if wget $DOWNLOAD_URI -O elasticsearch.tar.gz
then
    tar -zxf elasticsearch.tar.gz
    mv elasticsearch-$ELASTICSEARCH_VERSION elasticsearch
    rm elasticsearch/config/elasticsearch.yml
    ln -s $(pwd)/elasticsearch.yml elasticsearch/config/
    ./elasticsearch/bin/plugin install mobz/elasticsearch-head
    ./elasticsearch/bin/plugin install elasticsearch/elasticsearch-cloud-aws/1.11.0
    ./elasticsearch/bin/plugin -install lukas-vlcek/bigdesk
    ./elasticsearch/bin/plugin -install karmi/elasticsearch-paramedic
    echo "Done"
    echo "Start it with $ELASTICSEARCH_DIR/dev-start.sh"
else
    "Failed to download Elastic Search"
    exit 1
fi
