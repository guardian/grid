#!/usr/bin/env bash

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
ASG=$($SCRIPT_DIR/../get-asg.sh "$@" "ThrallAuto")

if [ $? -eq 1 ]
then
    echo $ASG
    echo "Usage ./start.sh <TEST|PROD>"
    exit 1
fi

# Go
CMD_RESUME="aws autoscaling --region eu-west-1 resume-processes --auto-scaling-group-name $ASG --scaling-processes ReplaceUnhealthy"
echo "Resuming ReplaceUnhealthy on $ASG"
$CMD_RESUME
