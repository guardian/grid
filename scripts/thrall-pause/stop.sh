#!/usr/bin/env bash

SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
ASG=$($SCRIPT_DIR/../get-asg.sh "$@" "ThrallAuto")

if [ $? -eq 1 ]
then
    echo $ASG
    echo "Usage ./stop.sh <TEST|PROD>"
    exit 1
fi

# Go
CMD_SUSPEND="aws autoscaling --region eu-west-1 suspend-processes --auto-scaling-group-name $ASG --scaling-processes ReplaceUnhealthy"
echo "Suspending ReplaceUnhealthy on $ASG"
$CMD_SUSPEND
