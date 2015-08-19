#!/usr/bin/env python

from ConfigParser import ConfigParser
from generate import generate_files

def _default_option(config, section, option, default=None):
    return config.get(section, option) \
        if config.has_option(section, option) else default


def main():
    config = ConfigParser()
    config.read('settings/settings.ini')

    aws_profile_name = _default_option(config, 'aws', 'profile-name', 'media-service')
    aws_region = _default_option(config, 'aws', 'region', 'eu-west-1')
    cf_stack = _default_option(config, 'aws', 'stack-name')

    output_dir = _default_option(config, 'output', 'directory', 'output')

    properties = config._sections['properties']

    generate_files(aws_profile_name, aws_region, cf_stack, output_dir, properties)

if __name__ == '__main__':
    main()
