# Generators

A collection of python scripts that will generate a set of configuration files used by the Grid.

## Requirements

- Python 2.7
- [pip](https://pip.pypa.io/en/stable/installing/)
- [virtualenv](http://docs.python-guide.org/en/latest/dev/virtualenvs/) `pip install virtualenv`
- AWS CLI
- Janus credentials for the `media-service` profile

Run `aws configure --profile media-service --region eu-west-1` to configure the region for the `media-service` profile.

## Configuration

Create a file `$HOME/.gu/grid/grid-settings.yml` using [grid-setting.yml.template](./grid-settings.yml.template)
as a template.

```sh
aws s3 cp s3://stack-properties/grid-settings.yml $HOME/.gu/grid/ --profile media-service
```

## dot-properties

To generate the `.properties` files, create the output directory `/etc/gu`:

```sh
mkdir /etc/gu
```

Then change ownership to your current user so that you can write to it:

```sh
sudo chown -R $(whoami) /etc/gu
```

Then run the [generator](./generate-dot-properties.sh)

```sh
./generate-dot-properties.sh
```


## Usage

There are four generators:
- dot_properties
- nginx
- imgops
- osx_hosts_file

The last three are only applicable when running the Grid via Docker containers.

The generators can be run in the following form:

```sh
python -m generators.<generator> /path/to/output/directory
```
