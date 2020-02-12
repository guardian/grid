#!/usr/bin/env bash

stage="$1"

aws s3 cp admin-tools/lambda/target/scala-2.12/admin-tools-lambda.jar \
s3://media-service-dist/${stage}/grid-admin-tools-lambda/admin-tools-lambda.jar \
--profile media-service

