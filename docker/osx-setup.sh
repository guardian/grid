#!/bin/bash

# memory in MB to grant docker machine
MEMORY=8192

docker-machine stop default

echo 'Changing memory available to docker machine...'
cat $HOME/.docker/machine/machines/default/config.json \
  | jq ".Driver.Memory |= $MEMORY" \
  > $HOME/.docker/machine/machines/default/_config.json

mv $HOME/.docker/machine/machines/default/_config.json $HOME/.docker/machine/machines/default/config.json
echo 'Done'

VBoxManage modifyvm "default" --memory $MEMORY

docker-machine start default

# TODO add to /etc/hosts
