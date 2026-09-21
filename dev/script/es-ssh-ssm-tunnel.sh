#!/usr/bin/env bash
set -e

function HELP {
>&2 cat << EOF

  Usage: ${0} [-s TEST]

  This script sets up an SSM port-forwarding tunnel from localhost port 9200
  to the ElasticSearch instance provided on port 9200. It blocks in the
  foreground for the lifetime of the tunnel - stop it with ctrl-C.

    -h            Displays this help message. No further functions are
                  performed.

EOF
exit 1
}

# Process options
while getopts s:h FLAG; do
  case $FLAG in
    h)  #show help
      HELP
      ;;
    s)
      STAGE=$OPTARG
  esac
done
shift $((OPTIND-1))


if [ -z "${STAGE}" ]; then
  STAGE="TEST"
fi

echo "🛰 fetching newest elasticsearch instance id from AWS"

INSTANCE_ID=$(aws ec2 describe-instances \
  --filters \
      "Name=tag:App,Values=elasticsearch-data" \
      "Name=tag:Stack,Values=media-service" \
      "Name=tag:Stage,Values=$STAGE" \
      "Name=instance-state-name,Values=running" \
  --query "Reservations[].Instances[] | sort_by(@, &LaunchTime)[-1].InstanceId" \
  --output text \
  --region eu-west-1 \
  --profile media-service)

if [ -z "${INSTANCE_ID}" ] || [ "${INSTANCE_ID}" == "None" ]; then
  echo "🚨 Could not find a running elasticsearch-data instance for stage ${STAGE}"
  exit 1
fi

echo "📠 ESTABLISHING CONNECTION to ${INSTANCE_ID}"

aws ssm start-session \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"localhost\"],\"portNumber\":[\"9200\"],\"localPortNumber\":[\"9200\"]}" \
  --target "$INSTANCE_ID" \
  --region eu-west-1 \
  --profile media-service
