#!/usr/bin/env bash
set -e -x

ID=$2
BUCKET=$1

echo "Processing $ID in $BUCKET"

grid image:download -d=. $ID
grid image:get --hydrate $ID > $ID.json

exiftool -all= $ID
yarn update $ID
yarn s3 $BUCKET $ID

echo "DONE"
