#!/bin/bash
# Run by localstack once it is ready (every time the container starts, as localstack does not persist its state).
# Creates the core stack and uploads the config files the Grid apps expect. Bucket names are fixed in the template.
set -euo pipefail

# Grid's apps and generate-config use eu-west-1; awslocal would otherwise default to us-east-1
export AWS_DEFAULT_REGION=eu-west-1

STACK=grid-dev-core
SEED=/seed

# shellcheck disable=SC1091
API_KEY=$(grep '^API_KEY=' "$SEED/.env" | cut -d= -f2-)

echo "creating $STACK"
awslocal cloudformation create-stack --stack-name "$STACK" --template-body "file://$SEED/cloudformation/grid-dev-core.yml" > /dev/null
awslocal cloudformation wait stack-create-complete --stack-name "$STACK"

awslocal s3 cp "$SEED/config/photographers.json" s3://grid-dev-configbucket/
awslocal s3 cp "$SEED/config/rcs-quota.json" s3://grid-dev-configbucket/
awslocal s3 cp "$SEED/config/usage_rights.json" s3://grid-dev-configbucket/
awslocal s3 cp "$SEED/config/usages.eml" s3://grid-dev-usagemailbucket/
echo "DEV Key" | awslocal s3 cp - "s3://grid-dev-keybucket/$API_KEY"

echo "seeded localstack"
