import os
from . import *
import logging
from cloudformation import get_stack_outputs


LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
LOGGER = logging.getLogger(LOGGER_NAME)


def generate(directory):
    create_directory(directory)
    template = get_template_environment('imgops').get_template('nginx.conf.template')

    bucket = get_stack_outputs().get('ImageBucket')

    params = {
        'ImageBucket': bucket
    }

    LOGGER.info('Bucket name: {}'.format(params['ImageBucket']))

    rendered = template.render(**params)

    output_file = os.path.join(directory, 'nginx.conf')

    with open(output_file, 'wb') as f:
        f.write(rendered)

    LOGGER.info('Created {}'.format(output_file))

if __name__ == '__main__':
    output_dir = get_output_directory()

    if output_dir:
        LOGGER.info('Start')
        generate(output_dir)
        LOGGER.info('End')
