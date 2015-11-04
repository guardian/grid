#!/usr/bin/env python

from ConfigParser import ConfigParser
from generate import generate_files

CONFIG_FILE = '/etc/gu/grid-settings.ini'
OUTPUT_DIR = '/etc/gu'

def _default_option(config, section, option, default=None):
    return config.get(section, option) \
        if config.has_option(section, option) else default


def main():
    config = ConfigParser()
    config.read(CONFIG_FILE)

    aws_profile_name = _default_option(config, 'aws', 'profile-name', 'media-service')
    aws_region = _default_option(config, 'aws', 'region', 'eu-west-1')
    cf_stack = _default_option(config, 'aws', 'stack-name', None)

    if not cf_stack:
        raise Exception('No stack found in {}'.format(CONFIG_FILE))

    properties = config._sections['properties']

    generate_files(aws_profile_name, aws_region, cf_stack, OUTPUT_DIR, properties)

if __name__ == '__main__':
    main()
