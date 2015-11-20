#!/bin/bash

export STACK_NAME="media-service-DEV-`aws iam get-user | jq '.User.UserName' | tr -d '"'`"
