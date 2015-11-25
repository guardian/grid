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

So:

```sh
echo "source /usr/local/bin/virtualenvwrapper.sh" >> ~/.profile
```

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

Note that this script uses the [boto3](http://boto3.readthedocs.org/en/latest/index.html) library.
boto3 uses the [same authentication as the aws-cli](http://boto3.readthedocs.org/en/latest/guide/configuration.html#guide-configuration).

We expect you to have a `media-service` profile setup with the awscli:

```sh
aws configure --profile media-service
```

Note: As stated in the boto3 documentation, you must specify a region:

> you **must** have AWS credentials and a region set in order to make requests.

You can specify an alternative aws profile for this script to use by setting the `profile_name` value in `/etc/gu/grid-settings.ini` under the `aws` section.


### Generating .properties
To generate the .properties files, run the command:

```sh
sudo ./main.py
```

Note: `sudo` is needed as we write to `/etc/gu/`.
