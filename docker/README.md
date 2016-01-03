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
- Memory! By default, on OSX, the docker VM has 2GB of memory - you'll need to increase it.
- Ports! You need to forward the service ports from the Docker daemon VM to the host.

These can both be done by running [`./osx-setup.sh`](./osx-setup.sh).
