import boto3
import os
import logging
from . import *

logging.basicConfig(format='%(asctime)s %(name)s %(levelname)s %(message)s',
                    level=logging.INFO)

LOGGER = logging.getLogger('generate')

OUTPUT_DIR = '/configs/etc/gu'


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

    outputs = {
        'region': boto3.DEFAULT_SESSION._session.get_config_variable('region')
    }

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


def _write_template_to_disk(directory, template_name, parsed_template):
    property_file = os.path.splitext(template_name)[0]
    property_path = os.path.join(directory, property_file)

    with open(property_path, 'wb') as f:
        f.write(parsed_template)

    LOGGER.info('Created {file_path}'.format(file_path=property_path))


def generate_files(aws_profile_name, config_properties):
    _boto_session(aws_profile_name)
    stack_output = _get_stack_outputs()
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
    generate_files(config.get('aws_profile'), config.get('properties'))

if __name__ == '__main__':
    generate()
