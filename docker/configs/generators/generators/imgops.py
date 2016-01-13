import os
from . import *
import logging
from cloudformation import get_stack_outputs


LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
LOGGER = logging.getLogger(LOGGER_NAME)
OUTPUT_DIR = '/configs/imgops'


def generate():
    create_directory(OUTPUT_DIR)
    template = get_template_environment('imgops').get_template('nginx.conf.template')

    bucket = get_stack_outputs().get('ImageBucket')

    params = {
        'ImageBucket': bucket
    }

    LOGGER.info('Bucket name: {}'.format(params['ImageBucket']))

    rendered = template.render(**params)

    output_file = os.path.join(OUTPUT_DIR, 'nginx.conf')

    with open(output_file, 'wb') as f:
        f.write(rendered)

    LOGGER.info('Created {}'.format(output_file))

if __name__ == '__main__':
    LOGGER.info('Start')
    generate()
    LOGGER.info('End')
