# Docker

## Requirements
- Docker (duh!)
- Docker Compose

## Initial Setup
- Ensure you've set up the awscli with a `media-service` profile (`aws configure --profile media-service`).
- Create `$HOME/.gu/grid/grid-settings.yml` using [`grid-settings.yml.template`](./configs/generators/grid-settings.yml.template) as a template.
- Generate a wildcard cert for your domain and add the files to `$HOME/.gu/grid/ssl/media-service.crt` and `$HOME/.gu/grid/ssl/media-service.key`.
  NB - Docker cannot follow symlinks, so these have to be actual files.


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
Docker runs on a VM on OSX. By default, this VM is allocated 2GB of memory and you'll likely want to increase it.

You can do this using [`adjust-memory.sh`](./osx/adjust-memory.sh)

### DNS
You also need to edit you hosts file on OSX to route the DNS names to the IP address of the Docker VM.

Add the output of [`hosts.sh`](./osx/hosts.sh) to `/etc/hosts`.

### Shared folders
By default, Docker on OSX mounts `$HOME` as a shared folder between OSX and the Docker VM.
This shared folder uses the `vboxsf` driver which is slow! To get around this, use [docker-osx-dev](https://github.com/brikis98/docker-osx-dev):

```sh
cd /path/to/grid/docker
docker-osx-dev --machine-name $DOCKER_MACHINE_NAME
```
