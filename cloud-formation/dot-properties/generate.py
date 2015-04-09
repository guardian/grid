from boto import cloudformation
from jinja2 import Environment, FileSystemLoader
import os
import settings
import logging

logging.basicConfig(format='%(asctime)s %(name)s %(levelname)s %(message)s',
                    level=logging.INFO)

LOGGER = logging.getLogger('generate')


def _get_connection(profile_name, region_name):
    LOGGER.info('Connecting to AWS using Profile: {profile} in Region {region}'.format(profile=profile_name,
                                                                                       region=region_name))
    return cloudformation.connect_to_region(region_name=region_name, profile_name=profile_name)


def _get_stack_outputs(connection, stack_name_or_id):
    stack = connection.describe_stacks(stack_name_or_id=stack_name_or_id)

    if stack:
        LOGGER.info('Stack found: {stack}'.format(stack=stack_name_or_id))
        outputs = {o.key: o.value for o in stack[0].outputs}

        # Cropper service doesn't expect a protocol to be included,
        # remove the http:// string from the ImageOriginWebsite item.
        outputs['ImageOriginWebsite'] = outputs['ImageOriginWebsite'].replace('http://', '')

        return outputs
    else:
        LOGGER.warn('Stack not found: {stack}'.format(stack=stack_name_or_id))
        return None


def _get_template_environment():
    return Environment(loader=FileSystemLoader('templates'))


def _create_directory(directory):
    if not os.path.exists(directory):
        LOGGER.info('Creating directory {directory}'.format(directory=directory))
        os.makedirs(directory)


def _write_template_to_disk(directory, template_name, parsed_template):
    property_file = os.path.splitext(template_name)[0]
    property_path = os.path.join(directory, property_file)

    with open(property_path, 'wb') as f:
        f.write(parsed_template)

    LOGGER.info('Created {file_path}'.format(file_path=property_path))


def generate_files():
    connection = _get_connection(settings.AWS_PROFILE_NAME, settings.AWS_REGION)
    stack_output = _get_stack_outputs(connection, settings.STACK)

    LOGGER.info('Here is your CloudFormation Output')
    for k, v in stack_output.iteritems():
        LOGGER.info('{key} = {value}'.format(key=k, value=v))

    environment = _get_template_environment()
    stack_output.update(settings.INITIAL_PROPERTIES)

    if hasattr(settings, 'PROPERTIES'):
        stack_output.update(settings.PROPERTIES)

    LOGGER.info('Creating properties files in {directory}'.format(directory=settings.OUTPUT_DIRECTORY))

    _create_directory(settings.OUTPUT_DIRECTORY)

    for template in environment.list_templates():
        parsed = environment.get_template(template).render(**stack_output)
        _write_template_to_disk(settings.OUTPUT_DIRECTORY, template, parsed)

    LOGGER.info('DONE.')


if __name__ == '__main__':
    generate_files()
