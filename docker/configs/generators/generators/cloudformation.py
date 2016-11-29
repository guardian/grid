import boto3
from . import *
import logging
import os

LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
LOGGER = logging.getLogger(LOGGER_NAME)
STACK_NAME_FILE = os.path.join(os.path.expanduser('~'), '.gu', 'grid', 'dev_stack_name')


def _boto_session():
    aws_profile = get_config().get('aws_profile')
    LOGGER.info('Using AWS profile {}'.format(aws_profile))
    boto3.setup_default_session(profile_name=aws_profile)


def _get_stack_name():
    if os.path.isfile(STACK_NAME_FILE):
        with open(STACK_NAME_FILE, 'r') as f:
            stack_name = f.read().strip()
    else:
        stack_name = 'media-service-DEV'
        dirname = os.path.dirname(STACK_NAME_FILE)
        LOGGER.info('Creating stack name file {}'.format(STACK_NAME_FILE))
        if not os.path.isdir(dirname): os.makedirs(dirname, 0700)
        with open(STACK_NAME_FILE, 'w') as f:
            f.write(stack_name)
            f.close()

    LOGGER.info('Using stack {}'.format(stack_name))
    return stack_name


def get_stack_outputs():
    _boto_session()
    stack_name = _get_stack_name()
    cf_client = boto3.client('cloudformation')
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
