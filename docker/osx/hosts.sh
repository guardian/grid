#!/usr/bin/env bash

cd ../configs/generators

pip install -r requirements.txt > /dev/null 2>&1

echo '-------------------------------'
echo 'add these entries to /etc/hosts'
echo '-------------------------------'
echo
echo '# Grid Docker'
python -m generators.osx_hosts_file
