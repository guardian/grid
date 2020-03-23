#!/bin/bash

size=${1:-10}; shift
stage=${1:-test}; shift
profile=${1:-media-service}; shift
region=${1:-eu-west-1}; shift

cd $(dirname $0)

for a in 0 1 2 3 4 5 6 7 8 9 a b c d e f; do
   for b in 0 1 2 3 4 5 6 7 8 9 a b c d e f; do
     ./delete-images-by-prefix.sh $size $a$b $stage $profile $region
     if [[ $? -eq 0 ]]; then
        exit
     fi
   done
done
