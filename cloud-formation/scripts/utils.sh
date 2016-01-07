#!/usr/bin/env bash

md5hash() {
    if hash md5sum 2>/dev/null;
    then
        md5sum "$@"
    else
        # md5sum isn't available on OSX
        md5 "$@"
    fi
}

lower_case_random_string() {
    echo `head -c 1024 /dev/urandom | md5hash | tr '[:upper:]' '[:lower:]' | cut -c1-20`
}

get_stack_resource_physical_id() {
    echo `aws cloudformation list-stack-resources --stack-name $1 \
        | jq ".StackResourceSummaries[] | select(.LogicalResourceId == \"$2\") | .PhysicalResourceId" \
        | tr -d '"'`
}
