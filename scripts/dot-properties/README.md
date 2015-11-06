# .properties file generation

This directory holds a python script that can be used to generate the .properties files used to configure media-service.

## System Requirements

  * Python 2.7
  * AWS CLI with a `media-service` profile (`aws configure --profile media-service`).

It's recommended to use [virtual environments](http://docs.python-guide.org/en/latest/dev/virtualenvs/) to keep project dependencies separate from system site packages and other
projects - makes managing dependencies on different versions easy!

Additionally, [virtualenvwrapper](https://virtualenvwrapper.readthedocs.org/en/latest/) makes managing virtual environments easy!

Install virtualenv:

```sh
pip install virtualenv
```

Install virtualenvwrapper:

```sh
pip install virtualenvwrapper
```

NB: From the virtualenvwrapper docs:

> You will want to add the command to `source /usr/local/bin/virtualenvwrapper.sh` to your shell startup file, changing the path to virtualenvwrapper.sh depending on where it was installed by pip.

## Usage

### Install requirements

This assumes you're using [virtualenvwrapper](https://virtualenvwrapper.readthedocs.org/en/latest/).

Create a virtual environment:

```sh
mkvirtualenv media-service
```

If you've previously created it, run:

```sh
workon media-service
```

Install python requirements:

```sh
pip install -r requirements.txt
```

### Configure

You need to create the file `/etc/gu/grid-settings.ini` using [`settings/settings.ini.template`](./settings/settings.ini.template) as a template.

Additionally, the `aws` section can have the values:
 * `profile-name` which is the name of an [AWS CLI Profile](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) and is defaulted to `media-service`
 * `region` which is the region your CloudFormation is in. If none is specified it is defaulted to `eu-west-1`.


### Generating .properties
To generate the .properties files, run the command:

```sh
sudo ./main.py
```

NB: `sudo` is needed as we write to `/etc/gu/`.
