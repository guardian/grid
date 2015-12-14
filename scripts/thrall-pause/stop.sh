#!/usr/bin/env bash

ASG=$(../get-asg.sh "$@")

if [ $? -eq 1 ]
then
    echo $ASG
    exit 1
fi

# Go
CMD_SUSPEND="aws autoscaling --region eu-west-1 suspend-processes --auto-scaling-group-name $ASG --scaling-processes ReplaceUnhealthy"
echo "Suspending ReplaceUnhealthy on $ASG"
$CMD_SUSPEND
