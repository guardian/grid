#!/usr/bin/env bash

ID=$2
BUCKET=$1

echo "Processing $ID in $BUCKET"

grid image:download -d=. $ID
grid image:get --hyrdate $ID > $ID.json

yarn update $ID
yarn s3 $ID $BUCKET

echo "DONE"
