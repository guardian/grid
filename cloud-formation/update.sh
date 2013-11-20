STAGE=$1
MEDIA_API_CERT=$2
KAHUNA_CERT=$3

if ([ -z $STAGE ]); then
  echo "usage: $0 <STAGE> <Media API SSL Cert ARN> <Kahuna SSL Cert ARN>"
  exit 1
fi

TEMPLATE="$(dirname $0)/template.json"

cfn-update-stack media-service-$STAGE \
    --capabilities CAPABILITY_IAM \
    --template-file $TEMPLATE \
    --region eu-west-1 \
    --parameters "Stage=$STAGE;MediaApiSSLCertificateId=$MEDIA_API_CERT;KahunaSSLCertificateId=$KAHUNA_CERT"
