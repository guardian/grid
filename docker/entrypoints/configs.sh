#!/usr/bin/env bash

cd /configs/generators

pip install -r requirements.txt

python -m generators.dot_properties
python -m generators.nginx
python -m generators.imgops

cp -r /root/.gu/grid/ssl /configs/nginx/ssl
