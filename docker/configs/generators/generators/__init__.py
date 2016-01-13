import os
import yaml
from jinja2 import Environment, FileSystemLoader
import logging

logging.basicConfig(format='%(asctime)s %(name)s %(levelname)s %(message)s', level=logging.INFO)

CONFIG_FILE = os.path.join(os.environ['HOME'], '.gu', 'grid', 'grid-settings.yml')
RESOURCE_PATH = os.path.join(os.path.dirname(__file__), 'resources')
MAPPINGS_PATH = os.path.join(RESOURCE_PATH, 'nginx-mappings.yml')


def load_yaml(file):
    with open(file, 'r') as f:
        return yaml.load(f)


def get_config():
    config = load_yaml(CONFIG_FILE)
    config.setdefault('aws_profile', 'media-service')
    return config


def get_template_environment(generator):
    template_dir = os.path.join(RESOURCE_PATH, 'templates', generator)
    return Environment(loader=FileSystemLoader(template_dir))


def create_directory(path):
    if not os.path.exists(path):
        os.makedirs(path)


def get_domain():
    properties = get_config().get('properties')
    return [x.values()[0] for x in properties if 'domain_root' in x.keys()][0]


def get_mappings():
    return load_yaml(MAPPINGS_PATH).get('mappings')
