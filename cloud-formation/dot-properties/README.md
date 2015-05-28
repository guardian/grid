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

You need to create the following files within the `settings` directory.

NB: These files are excluded in [`.gitignore`](./.gitignore).

#### settings_dev.py

This file should have the following contents:

```python
PROPERTIES = {
    'domain_root': <PRIVATE_VALUE>,
    'mixpanel_token': <PRIVATE_VALUE>,
    'panda_domain': <PRIVATE_VALUE>,
    'panda_aws_key': <PRIVATE_VALUE>,
    'panda_aws_secret': <PRIVATE_VALUE>,
    'cors': <PRIVATE_VALUE>,
}

STACK = <CLOUD_FORMATION_NAME_OR_ID>
```

Additionally, you can specify:

```python
OUTPUT_DIRECTORY = <OUTPUT_DIRECTORY>
AWS_PROFILE_NAME = <AWS_CLI_CONFIGURATION_PROFILE>
AWS_REGION = <AWS_REGION>
```

Where:
  * ```<PRIVATE_VALUE>```s can be given to you by a member of The Grid development team.
  * ```<OUTPUT_DIRECTORY>``` is the location to write the .properties files to. Default is ```output```.
  * ```CLOUD_FORMATION_NAME_OR_ID``` is the Name or ID of your CloudFormatuon Stack.
  * ```<AWS_CLI_CONFIGURATION_PROFILE>``` is the name of an [AWS CLI Profile](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html)
    If none is specified it is defaulted to ```media-service```.
  * ```<AWS_REGION>``` is the region your CloudFormation is in. If none is specified it is defaulted to ```eu-west-1```.

#### env.py

This file should have the following contents:

```py
FLEXI_RUN_ENV=dev
```

This file is used to determine which settings file to use; it will take the values from `settings.py` and apply overrides from `settings_dev.py`.

### Generating .properties
To generate the .properties files, run the command:

```sh
python generate.py
```

NB: If you've set ```OUTPUT_DIRECTORY``` to a location not writable by the current user (e.g. ```/etc/gu```),
you can run:

```sh
sudo python generate.py
```
