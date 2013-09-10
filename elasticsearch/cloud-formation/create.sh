cfn-create-stack media-service-elasticsearch-$1 \
    --capabilities CAPABILITY_IAM \
    --template-file cf.json \
    --region eu-west-1 \
    --parameters "Stage=$1" \
    --disable-rollback
