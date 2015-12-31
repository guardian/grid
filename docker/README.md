# Docker

## Requirements
- Docker (duh!)

## Known Limitations
- Memory! By default, on OSX, the docker VM has 2GB of memory - you'll need to increase it

```sh
cat ~/.docker/machine/machines/default/config.json \
  | jq '.Driver.Memory' |= 6144 \
  > ~/.docker/machine/machines/default/config.json

for i in {9001..9010}; do
 VBoxManage modifyvm "default" --natpf1 "tcp-port$i,tcp,127.0.0.1,$i,,$i";
done
```

- Disk size available to elasticsearch for data?
