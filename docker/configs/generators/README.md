# Generators

A collection of python scripts that will generate a set of configuration files used by the Grid.

## Requirements

- Python 2.7
- [pip](https://pip.pypa.io/en/stable/installing/)
- [virtualenv](http://docs.python-guide.org/en/latest/dev/virtualenvs/) `pip install virtualenv`
- AWS CLI with a `media-service` profile

  `aws configure --profile media-service`

  NB: ensure you specify the aws region when prompted too.

## Configuration

Create a file `$HOME/.gu/grid/grid-settings.yml` using [grid-setting.yml.template](./grid-settings.yml.template)
as a template.

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
### dot-properties

To generate the `.properties` files, create the output directory `/etc/gu`:

```sh
sudo mkdir /etc/gu
```

Then change ownership to your current user so that you can write to it:

```sh
sudo chown -R $(whoami) /etc/gu
```

Then run the [generator](./generate-dot-properties.sh) (NOTE: you'll need full IAM credentials rather than temporary ones from Janus in order to run this. You'll also need a grid dev stack setup - see [the grid readme](https://github.com/guardian/grid)):

```sh
./generate-dot-properties.sh
```
