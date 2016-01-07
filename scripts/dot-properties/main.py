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

    aws_profile_name = _default_option(config, 'aws', 'profile_name', 'media-service')
    properties = config._sections['properties']

    generate_files(aws_profile_name, OUTPUT_DIR, properties)

if __name__ == '__main__':
    main()
