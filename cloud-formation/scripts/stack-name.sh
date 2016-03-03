#!/bin/bash

if [ -z "$GRID_STACK_NAME" ];
then
    USER_NAME=`aws iam get-user`

    if [ $? != "0" ]; then
        echo -e "\033[1;41m    FAILED!    \033[m"
        echo '`iam get-user` failed. Are you using temporary credentials?'
        echo 'If you are using temporary credentials please set the GRID_STACK_NAME environment variable and try again:'
        echo ''
        echo "  export GRID_STACK_NAME=DEV-foo && $0"
        echo ''
        exit 1
    else
        export STACK_NAME="media-service-DEV-`$USER_NAME | jq '.User.UserName' | tr -d '"' | tr [A-Z] [a-z]`"
    fi
else
    export STACK_NAME="media-service-$GRID_STACK_NAME"
fi
