STAGE=$1

if ([ -z $STAGE ]); then
  echo "usage: $0 <STAGE>"
  exit 1
fi

cfn-update-stack media-service-elasticsearch-$STAGE \
    --capabilities CAPABILITY_IAM \
    --template-file cf.json \
    --region eu-west-1 \
    --parameters "Stage=$1"
