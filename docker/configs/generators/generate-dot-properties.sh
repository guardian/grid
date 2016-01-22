#!/usr/bin/env bash

if [ $# -lt 1 ]
then
    echo 'usage: generate-dot-properties <DESTINATION_DIR>'
    exit 1
fi

DESTINATION=$1

if [ ! -f ".venv/bin/python" ]; then
    echo 'creating a virtualenv'
    virtualenv --no-site-packages --quiet .venv
fi

source .venv/bin/activate
pip install --quiet -r requirements.txt

echo "creating dot-properties to ${DESTINATION}"
python -m generators.dot_properties ${DESTINATION}
