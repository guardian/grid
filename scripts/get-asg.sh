#!/usr/bin/env bash

ENV=$1
APP=$2

if [ -z $ENV ];
then
    echo "Please specify an environment."
    exit 1
fi

if [ -z $APP ];
then
    echo "Please specify a autoscaling group."
    echo
    exit 1
fi

ASG=$(aws autoscaling describe-auto-scaling-groups --region eu-west-1 |\
    jq ".AutoScalingGroups[] | select(.AutoScalingGroupARN | contains(\"${ENV}\") and contains(\"${APP}\")) | .AutoScalingGroupName" | sed 's/"//g')

echo $ASG
