import boto3
from . import *
import logging
import os

LOGGER_NAME = os.path.splitext(os.path.basename(__file__))[0]
LOGGER = logging.getLogger(LOGGER_NAME)
STACK_NAME = 'media-service-DEV'

def _boto_session():
    aws_profile = get_config().get('aws_profile')
    LOGGER.info('Using AWS profile {}'.format(aws_profile))
    boto3.setup_default_session(profile_name=aws_profile)

def get_stack_outputs():
    _boto_session()
    LOGGER.info('Using stack {}'.format(STACK_NAME))
    cf_client = boto3.client('cloudformation')
    stack = cf_client.describe_stacks(StackName=STACK_NAME)

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
