# .properties file generation

This directory holds a python script that can be used to generate the .properties files used to configure media-service.

## System Requirements

  * Python 2.7

### Optional

It's recommended to use virtual environments to keep project dependencies separate from system site packages and other
projects - makes managing dependencies on different versions easy!

  * [virtualenv](http://docs.python-guide.org/en/latest/dev/virtualenvs/)

For bonus points, use [virtualenvwrapper](https://virtualenvwrapper.readthedocs.org/en/latest/) on top of virtualenv.

## Usage

### Install requirements

If you're using a virtual environment, you first need to create one:

```sh
virtualenv venv
```

Then activate it:

```sh
source venv/bin/activate
```

Install python requirements:

```sh
pip install -r requirements.txt
```


### Configure

Configuration is done via a settings file.

Create a file called ```settings_dev.py``` in the ```settings``` directory. Where ```dev``` denotes the environment
(or developer). Although the filename is somewhat arbitrary, it must be prefixed with ```settings_```.

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
    If none is specified it is defaulted to ```default```.
  * ```<AWS_REGION>``` is the region your CloudFormation is in. If none is specified it is defaulted to ```eu-west-1```.

### Generating .properties

Now that you've got your configuration file, you need to tell the script what settings file to use. You can either set
the ```FLEXI_RUN_ENV``` environment variable or create a file ```env.py``` in the ```settings``` directory with the
contents: ```FLEXI_RUN_ENV=dev``` where ```dev``` is the name of your settings file created above.

To generate the .properties files, run the command:

```sh
python generate.py
```

NB: If you've set ```OUTPUT_DIRECTORY``` to a location not writable by the current user (e.g. ```/etc/gu```),
you can run:

```sh
sudo python generate.py
```
