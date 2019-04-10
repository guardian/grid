#!/bin/bash -e

SCRIPT_DIR=$(dirname $0)

function create_config_map {
    app=${1}
    kubectl create configmap ${app} \
        --from-file=auth.conf=${SCRIPT_DIR}/conf/${app}.conf \
        -o yaml --dry-run | kubectl apply -f -
}

# Create config maps
for app in auth collections; do
    create_config_map $app
done

# Create AWS creds config map
kubectl create configmap aws-credentials \
  --from-file=aws-credentials=${HOME}/.aws/credentials \
  -o yaml --dry-run | kubectl apply -f -

# Spin up stack
kubectl apply -f ${SCRIPT_DIR}/grid.yaml
