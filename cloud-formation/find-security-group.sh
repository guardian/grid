STACK=$1
STAGE=$2

if ([ -z $STAGE ] || [ -z $STACK ]); then
  echo "usage: $0 <STACK> <STAGE>"
  exit 1
fi

cfn-list-stack-resources \
    --region eu-west-1 \
    --stack-name media-service-base-$STAGE \
    | awk "tolower(\$2) ~ \"$STACK\" { print \$3  }"
