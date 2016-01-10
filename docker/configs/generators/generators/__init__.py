import os
import yaml
from jinja2 import Environment, FileSystemLoader

CONFIG_FILE = os.path.join(os.environ['HOME'], '.gu', 'grid', 'grid-settings.yml')
RESOURCE_PATH = os.path.join(os.path.dirname(__file__), 'resources')


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
