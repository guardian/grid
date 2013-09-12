STAGE=$1

if ([ -z $STAGE ]); then
  echo "usage: $0 <STAGE>"
  exit 1
fi

TEMPLATE="$(dirname $0)/base.json"

cfn-update-stack media-service-base-$STAGE \
    --capabilities CAPABILITY_IAM \
    --template-file $TEMPLATE \
    --region eu-west-1 \
    --parameters "Stage=$STAGE"
