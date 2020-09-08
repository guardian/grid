#!/bin/bash

size=${1:-10}; shift
stage=${1:-test}; shift
profile=${1:-media-service}; shift
region=${1:-eu-west-1}; shift

cd $(dirname $0)

./delete-images-by-prefix.sh $size '/' $stage $profile $region
