#!/usr/bin/env bash

cd ../configs/generators

if [ ! -f ".venv/bin/python" ]; then
    echo 'creating a virtualenv'
    virtualenv --no-site-packages --quiet .venv
fi

source .venv/bin/activate
pip install --quiet -r requirements.txt

echo '-------------------------------'
echo 'add these entries to /etc/hosts'
echo '-------------------------------'
echo
echo '# Grid Docker'
python -m generators.osx_hosts_file
