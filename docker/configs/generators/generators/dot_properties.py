import os
import logging
from . import *
from cloudformation import get_stack_outputs

LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
LOGGER = logging.getLogger(LOGGER_NAME)
OUTPUT_DIR = '/configs/etc/gu'


def _write_template_to_disk(directory, template_name, parsed_template):
    property_file = os.path.splitext(template_name)[0]
    property_path = os.path.join(directory, property_file)

    with open(property_path, 'wb') as f:
        f.write(parsed_template)

    LOGGER.info('Created {file_path}'.format(file_path=property_path))


def generate_files(config_properties):
    stack_output = get_stack_outputs()
    [stack_output.update(prop) for prop in config_properties]

    stack_output['domain_root'] = 'media.{}'.format(stack_output['domain_root'])

    environment = get_template_environment('dot-properties')

    LOGGER.info('Creating properties files in {directory}'.format(directory=OUTPUT_DIR))

    create_directory(OUTPUT_DIR)

    for template in environment.list_templates():
        parsed = environment.get_template(template).render(**stack_output)
        _write_template_to_disk(OUTPUT_DIR, template, parsed)

    LOGGER.info('DONE.')


def generate():
    config = get_config()
    generate_files(config.get('properties'))

if __name__ == '__main__':
    LOGGER.info('Start')
    generate()
    LOGGER.info('End')
