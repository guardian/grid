import boto3
from jinja2 import Environment, FileSystemLoader
import os
import logging

logging.basicConfig(format='%(asctime)s %(name)s %(levelname)s %(message)s',
                    level=logging.INFO)

LOGGER = logging.getLogger('generate')


def _boto_session(aws_profile_name):
    LOGGER.info('Using AWS profile {}'.format(aws_profile_name))
    boto3.setup_default_session(profile_name=aws_profile_name)


def _get_stack_name():
    user = boto3.resource('iam').CurrentUser()
    stack_name = 'media-service-DEV-{}'.format(user.user_name)
    LOGGER.info('Using stack {}'.format(stack_name))
    return stack_name


def _get_client():
    return boto3.client('cloudformation')


def _get_stack_outputs():
    stack_name = _get_stack_name()
    cf_client = _get_client()
    stack = cf_client.describe_stacks(StackName=stack_name)

    outputs = {}

    LOGGER.info('Here is your CloudFormation Stack output')

    for output in stack['Stacks'][0]['Outputs']:
        key = output['OutputKey']
        value = output['OutputValue']

        # Cropper service doesn't expect a protocol to be included,
        # remove the http:// string from the ImageOriginWebsite item.
        if key == 'ImageOriginWebsite':
            value = value.replace('http://', '')

        LOGGER.info('{key} = {value}'.format(key=key, value=value))

        outputs[key] = value

    return outputs


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


def generate_files(aws_profile_name, output_dir, props):
    _boto_session(aws_profile_name)
    stack_output = _get_stack_outputs()

    environment = _get_template_environment()
    stack_output.update(props)

    LOGGER.info('Creating properties files in {directory}'.format(directory=output_dir))

    _create_directory(output_dir)

    for template in environment.list_templates():
        parsed = environment.get_template(template).render(**stack_output)
        _write_template_to_disk(output_dir, template, parsed)

    LOGGER.info('DONE.')
