#!/bin/bash

if [ -z "$ENV" ];
then
    if [ $# -eq 1 ];
    then
        export STACK_NAME="media-service-$1-DEV-`aws iam get-user | jq '.User.UserName' | tr -d '"'`"
    else
        export STACK_NAME="media-service-DEV-`aws iam get-user | jq '.User.UserName' | tr -d '"'`"
    fi
else
    export STACK_NAME="media-service-$ENV"
fi
