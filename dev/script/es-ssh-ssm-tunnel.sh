#!/usr/bin/env bash
set -e

function HELP {
>&2 cat << EOF

  Usage: ${0} -t ES-HOST [-s TEST] [-u ubuntu]

  This script sets up an ssh tunnel from localhost port 9200 to the ElasticSearch provided on port 9200

    -v            Verbose ssh output

    -h            Displays this help message. No further functions are
                  performed.

EOF
exit 1
}

BACKGROUND="-f"
VERBOSE=""

# Process options
while getopts u:s:t:hv FLAG; do
  case $FLAG in
    h)  #show help
      HELP
      ;;
    v)
      VERBOSE="-v"
      ;;
    s)
      STAGE=$OPTARG
  esac
done
shift $((OPTIND-1))


if [ -z "${STAGE}" ]; then
  STAGE="TEST"
fi

echo "🛰 fetching connection details from ssm"

SSM_COMMAND=$(ssm ssh --profile media-service -t elasticsearch-data,media-service,$STAGE --newest --ssm-tunnel --raw)

echo "📠 ESTABLISHING CONNECTION"

echo "$SSM_COMMAND"
eval $SSM_COMMAND $VERBOSE -L 9200:localhost:9200 -N
