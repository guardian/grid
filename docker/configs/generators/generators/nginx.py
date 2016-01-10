import os
from . import *

OUTPUT_DIR = '/configs/nginx/sites-enabled'
MAPPINGS_PATH = os.path.join(RESOURCE_PATH, 'nginx-mappings.yml')


def _get_domain():
    properties = get_config().get('properties')
    return [x.values()[0] for x in properties if 'domain_root' in x.keys()][0]


def _get_mappings():
    domain = _get_domain()
    mappings = load_yaml(MAPPINGS_PATH).get('mappings')

    for mapping in mappings:
        mapping['domain'] = domain

        # set default port
        mapping.setdefault('port', 9000)

    return mappings


def generate():
    create_directory(OUTPUT_DIR)

    mappings = _get_mappings()
    template = get_template_environment('nginx').get_template('https-proxy-server.template')

    for mapping in mappings:
        rendered = template.render(**mapping)
        output_path = os.path.join(OUTPUT_DIR, '{}.conf'.format(mapping.get('container')))

        with open(output_path, 'wb') as f:
            f.write(rendered)

if __name__ == '__main__':
    generate()
