import os
from . import *
import logging

LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
LOGGER = logging.getLogger(LOGGER_NAME)
OUTPUT_DIR = '/configs/nginx/sites-enabled'


def _get_mappings():
    domain = get_domain()
    mappings = get_mappings()

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
        LOGGER.info('creating {}'.format(output_path))

        with open(output_path, 'wb') as f:
            f.write(rendered)

if __name__ == '__main__':
    LOGGER.info('Start')
    generate()
    LOGGER.info('End')
