# Using Docker for DEV

Grid has a micro-service architecture which is great for separating concerns,
however it does mean setting up a development environment can be a little confusing.

[Docker](https://www.docker.com/) is well suited to this problem, allowing you to compose the
structure of an app in a [yaml file](./docker-compose.yml).

NB: this has **not** been tested in PROD.

## Architecture
There is a container for each service of the Grid.

There is also a:
- `configs` container which will generate all the required configs
- `data` container which is a shared [volume container](https://docs.docker.com/engine/userguide/dockervolumes/#creating-and-mounting-a-data-volume-container).
  This container shares the code across the containers and the `.ivy2` and `.sbt` directories
  allowing the cached files to be shared between containers.
- `nginx` container, a proxy server to each of the services

## Requirements
- Docker
- Docker Compose

### Additional requirements for OSX
- [docker-osx-dev](https://github.com/brikis98/docker-osx-dev)

## Setup
- Ensure you've set up the aws-cli with a `media-service` profile (`aws configure --profile media-service`).
- Create `$HOME/.gu/grid/grid-settings.yml` using [`grid-settings.yml.template`](./configs/generators/grid-settings.yml.template) as a template.
- Generate a wildcard cert for `*.domain` and add the files to `$HOME/.gu/grid/ssl/media-service.crt` and `$HOME/.gu/grid/ssl/media-service.key`.
- Generate a wildcard cert for `*.media.domain` and add the files to `$HOME/.gu/grid/ssl/star.media-service.crt` and `$HOME/.gu/grid/ssl/star.media-service.key`.

NB: Docker cannot follow symlinks, so these have to be actual files.

### Additional setup for OSX
#### Memory
Docker runs on a VM on OSX. By default, this VM is allocated 2GB of memory and you'll likely want to increase it.

You can do this using [`adjust-memory.sh`](./osx/adjust-memory.sh) which will set it to 8GB.

#### DNS
You also need to edit you hosts file on OSX to route the DNS names to the IP address of the Docker VM.

Add the output of [`hosts.sh`](./osx/hosts.sh) to `/etc/hosts`.

## Usage
```sh
cd /path/to/grid/

docker-compose up -d
```

The `-d` flag will run the services as a daemon.

NB: the initial launch may take some time as the Docker images are downloaded and the ivy cache is populated and the project dependencies are retrieved.

### OSX usage
Containers are not natively supported on OSX (boo!). Docker runs inside a VM.

By default, the driver for this VM is VirtualBox, which mounts shared directories using the `vboxsf` file system which is pretty slow.
Fortunately, [docker-osx-dev](https://github.com/brikis98/docker-osx-dev) exists to provide a solution that uses `rsync`
(see the project page for more information).

So, usage on OSX becomes:

```sh
cd /path/to/grid/

eval "$(docker-machine env default)"

docker-osx-dev --machine-name $DOCKER_MACHINE_NAME

docker-compose up -d
```

## Monitoring
### Logs
You can access the logs of a container by running:

```sh
docker-compose logs <container-name>
```

For example `docker-compose logs kahuna`.

### Performance
You can get basic stats from the running containers by

```sh
docker stats $(docker ps -a -q)
```
