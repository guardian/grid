#!/bin/sh

ELASTICSEARCH_DIR=$(dirname $0)

ES_OPTIONS="-Des.discovery.type=zen
            -Des.index.number_of_replicas=0
            -Des.gateway.recover_after_nodes=1
            -Des.gateway.recover_after_time=5s
            -Des.gateway.expected_nodes=1
            -Des.discovery.zen.minimum_master_nodes=1
            -Des.path.data=data
            -Des.path.logs=logs
            -Des.path.conf=config
            -Des.client.transport.sniff=false"

$ELASTICSEARCH_DIR/elasticsearch/bin/elasticsearch $ES_OPTIONS $*

echo "Started. Try: http://localhost:9200/_plugin/head/ (may take a few seconds to become available)"
