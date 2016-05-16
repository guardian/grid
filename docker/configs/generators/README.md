# Generators

A collection of python scripts that will generate a set of configuration files used by the Grid.

## Requirements

- Python 2.7
- AWS CLI with a `media-service` profile

  `aws configure --profile media-service`

  NB: ensure you specify the aws region when prompted too.

## Setup

Install the requirements:

```sh
pip install -r requirements.txt
```

We recommend using a [virtual environment](http://docs.python-guide.org/en/latest/dev/virtualenvs/)
and [virtualenvwrapper](https://virtualenvwrapper.readthedocs.org/en/latest/).

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

To generate the `.properties` files, create your output directory and run:

```sh
python -m generators.dot_properties /etc/gu
```

Or, alternatively, just run [`./generate-dot-properties.sh`](./generate-dot-properties.sh).
