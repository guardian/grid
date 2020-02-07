#!/bin/bash

cmd="echo curl -X PUT localhost:9200/_cluster/settings -d \"{ \\\"transient\\\" : { \\\"cluster.routing.allocation.exclude._ip\\\" : \\\"$2\\\" } }\""

ssm cmd \
   --profile media-service \
   --region eu-west-1 \
   -i $1 \
   --cmd "$cmd"
