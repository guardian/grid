# Docker


## Requirements
- Docker (duh!)
- Docker Compose


## Usage
```sh
docker-compose up -d
```

To look at the logs for a specific service:

```sh
docker-compose logs <service>
```

## Known Limitations on OSX
### Memory
By default, on OSX, the docker VM has 2GB of memory - you'll most likely want to increase it.

This can be done by running [`./osx-setup.sh`](./osx-setup.sh).

### Shared folders
By default, Docker on OSX mounts `$HOME` as a shared folder between OSX and the Docker VM.
This shared folder uses the `vboxsf` driver which is slow! To get around this, use [docker-osx-dev](https://github.com/brikis98/docker-osx-dev):

```sh
cd /path/to/grid/docker
dockerdocker-osx-dev --machine-name default
```

### DNS
You'll need to add the service addresses to `/etc/hosts` on OSX to ensure they resolve to the VM e.g:

```sh
# contents of /etc/hosts

192.168.99.100 api.media.foobar.co.uk
```
