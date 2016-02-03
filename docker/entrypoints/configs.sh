#!/usr/bin/env bash

cd /configs/generators

pip install -r requirements.txt

python -m generators.dot_properties /configs/etc/gu
python -m generators.nginx /configs/etc/nginx
python -m generators.imgops /configs/imgops

# as the containers are linked, their hosts file maps `elasticsearch` to the correct endpoint
echo "es.host=elasticsearch\n" >> /configs/etc/gu/thrall.properties
echo "es.host=elasticsearch\n" >> /configs/etc/gu/media-api.properties

cp -r /root/.gu/grid/ssl /configs/etc/nginx/ssl
