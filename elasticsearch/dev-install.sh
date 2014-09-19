#!/bin/sh

ELASTICSEARCH_VERSION=1.3.2
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
    cp elasticsearch.yml elasticsearch/config/
    # replace this one variable which isn't stringified and therefore
    # breaks the config syntax otherwise
    sed -i -e 's,@@MIN_MASTER_NODES,1,g' elasticsearch/config/elasticsearch.yml
    # no aws availability zones in dev
    sed -i -e 's,cluster.routing.allocation.awareness.attributes: aws_availability_zone,,g' elasticsearch/config/elasticsearch.yml
    cd elasticsearch
    ./bin/plugin -install mobz/elasticsearch-head
    ./bin/plugin -install elasticsearch/elasticsearch-cloud-aws/2.3.0
    ./bin/plugin -install lukas-vlcek/bigdesk
    ./bin/plugin -install karmi/elasticsearch-paramedic
    echo "Done"
    echo "Start it with $ELASTICSEARCH_DIR/dev-start.sh"
else
    "Failed to download Elastic Search"
    exit 1
fi
