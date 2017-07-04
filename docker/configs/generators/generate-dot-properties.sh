#!/usr/bin/env bash

cd "${0%/*}"
DESTINATION="/etc/gu"

if [ ! -f ".venv/bin/python" ]; then
    echo 'creating a virtualenv'
    virtualenv --no-site-packages --quiet .venv
fi

source .venv/bin/activate
pip install --quiet -r requirements.txt

python - <<'EOF'
import boto3, os
from generators.cloudformation import _boto_session
try:
    _boto_session()
    boto3.client('cloudformation')
except:
    exit(1)
exit(0)
EOF

if [[ $? -ne 0 ]]
then
    echo "error when creating AWS session. Try 'aws configure --profile <profile>', and make sure to include a region"
    exit 1
fi

echo "creating dot-properties to ${DESTINATION}"
python -m generators.dot_properties ${DESTINATION}
