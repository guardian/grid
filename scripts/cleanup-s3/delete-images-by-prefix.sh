#!/bin/bash

size=${1:-10}; shift
prefix=${1:00}; shift
stage=${1:-test}; shift
profile=${1:-media-service}; shift
region=${1:-eu-west-1}; shift

creds="--profile $profile --region $region"
s3cmd="aws $creds s3 "
s3apicmd="aws $creds s3api "

function getBucket {
   $s3cmd ls | grep media-service-$stage-imagebucket | awk '{print $3}'
}

function getImages {
   $s3apicmd list-objects --bucket $bucket --page-size $size --max-items $size --prefix $prefix
}

function constructAwsJson {
   cat | jq '
[
   .Contents[]
   | 
   { "Key": .Key }
]
| 
{
  "Objects": .,
  "Quiet": false
}
'
}

bucket=$(getBucket)

echo "Deleting up to $size images in root of $bucket using profile $profile in region $region"

tempFile=$(mktemp)
echo "Using temp file $tempFile"

getImages | constructAwsJson > $tempFile

empty=$(find $(dirname $tempFile) -empty -name $(basename $tempFile) | wc -l)
if [[ $empty -eq 1 ]]; then
  echo "No images found to match prefix $prefix"
  rc=1
else
  $s3apicmd delete-objects --bucket $bucket --delete file://$tempFile
  rc=$?
fi

rm $tempFile
exit $rc
