STAGE=$1

if ([ -z $STAGE ]); then
  echo "usage: $0 <STAGE>"
  exit 1
fi

TEMPLATE="$(dirname $0)/elasticsearch.json"

cfn-create-stack media-service-elasticsearch-$STAGE \
    --capabilities CAPABILITY_IAM \
    --template-file $TEMPLATE \
    --region eu-west-1 \
    --parameters "Stage=$STAGE" \
    --disable-rollback
