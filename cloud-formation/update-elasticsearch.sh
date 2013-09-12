STAGE=$1
SECURITY_GROUP=$2

if ([ -z $STAGE ] || [ -z $SECURITY_GROUP ]); then
  echo "usage: $0 <STAGE> <SECURITY_GROUP>"
  exit 1
fi

TEMPLATE="$(dirname $0)/elasticsearch.json"

cfn-update-stack media-service-elasticsearch-$STAGE \
    --capabilities CAPABILITY_IAM \
    --template-file $TEMPLATE \
    --region eu-west-1 \
    --parameters "Stage=$STAGE;SecurityGroup=$SECURITY_GROUP"
