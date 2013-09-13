STACK=$1
STAGE=$2

if ([ -z $STAGE ] || [ -z $STACK ]); then
  echo "usage: $0 <STACK> <STAGE>"
  exit 1
fi

cfn-describe-stacks \
    --region eu-west-1 \
    --stack-name media-service-base-$STAGE \
    --delimiter $ \
    | awk -F$ "{ print \$5  }" \
    | awk -v k=${STACK}SecurityGroup -F\; \
      "{ for (i=1;i<=NF;i++) { split(\$i, field, \"=\"); if (tolower(field[1]) == tolower(k)) print field[2]; } }"
