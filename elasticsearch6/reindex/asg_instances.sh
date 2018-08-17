#/bin/bash

ASG=$1

aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names $ASG --region eu-west-1 | jq ".AutoScalingGroups[].Instances | length"
