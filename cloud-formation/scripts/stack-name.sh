#!/bin/bash

if [ -z "$ENV" ];
then
    export STACK_NAME="media-service-DEV-`aws iam get-user | jq '.User.UserName' | tr -d '"' | tr [A-Z] [a-z]`"
else
    export STACK_NAME="media-service-$ENV"
fi
