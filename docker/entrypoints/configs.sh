#!/usr/bin/env bash

cd /configs/generators

pip install -r requirements.txt

python -m generators.dot_properties /configs/etc/gu
python -m generators.nginx /configs/etc/nginx
python -m generators.imgops /configs/imgops

cp -r /root/.gu/grid/ssl /configs/etc/nginx/ssl
