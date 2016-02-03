import os
import logging
from . import *
from cloudformation import get_stack_outputs

LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
LOGGER = logging.getLogger(LOGGER_NAME)


def _write_template_to_disk(directory, template_name, parsed_template):
    property_file = os.path.splitext(template_name)[0]
    property_path = os.path.join(directory, property_file)

    with open(property_path, 'wb') as f:
        f.write(parsed_template)
        # force newline at end of file
        f.write('\n')

    LOGGER.info('Created {file_path}'.format(file_path=property_path))


def generate_files(directory, config_properties):
    stack_output = get_stack_outputs()
    [stack_output.update(prop) for prop in config_properties]

    stack_output['domain_root'] = 'media.{}'.format(stack_output['domain_root'])

    environment = get_template_environment('dot-properties')

    create_directory(directory)
    LOGGER.info('Creating properties files in {directory}'.format(directory=directory))

    for template in environment.list_templates():
        parsed = environment.get_template(template).render(**stack_output)
        _write_template_to_disk(directory, template, parsed)

    LOGGER.info('DONE.')


def generate(directory):
    config = get_config()
    generate_files(directory, config.get('properties'))

if __name__ == '__main__':
    output_dir = get_output_directory()

    if output_dir:
        LOGGER.info('Start')
        generate(output_dir)
        LOGGER.info('End')
