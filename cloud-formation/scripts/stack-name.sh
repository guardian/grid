#!/bin/bash

STACK_NAME_FILE="${HOME}/.gu/grid/dev_stack_name"

if [ -f ${STACK_NAME_FILE} ]; then
    export STACK_NAME=`cat ${STACK_NAME_FILE}`
else
    USER_NAME=`aws iam get-user`

    if [ $? != "0" ]; then
        echo -e "\033[1;41m    FAILED!    \033[m"
        echo '`iam get-user` failed. Are you using temporary credentials?'
        echo "If you are using temporary credentials please create ${STACK_NAME_FILE} with the name of your stack"
        echo ''
        echo "  echo media-service-DEV-foobar > ${STACK_NAME_FILE} && $0"
        echo ''
        exit 1
    else
        USER_NAME_EXTRACTED=`echo $USER_NAME | jq '.User.UserName' | tr -d '"' | tr [A-Z] [a-z]`
        export STACK_NAME=media-service-DEV-$USER_NAME_EXTRACTED
    fi
fi
