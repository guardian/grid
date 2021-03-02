import json
import datetime
import os
import sys
import boto3

sys.path.append(os.path.join(os.path.dirname(os.path.realpath(__file__)), "./libs"))   # Allow for packaged libs to be included
import urllib3
import requests

ENVIRONMENT = os.environ['ENV']
AWS_LAMBDA_FUNCTION_NAME = os.environ['AWS_LAMBDA_FUNCTION_NAME']
RETRY_ATTEMPTS = 3

LOADER_URL = os.environ['LOADER_URL']

API_KEY_HEADER = "X-Gu-Media-Key"
API_KEY_HEADER_VALUE = os.environ['API_KEY']
ORIGIN_HEADER = "Origin"
ORIGIN_HEADER_VALUE = os.environ['ORIGIN_URL']
CONTENT_HEADER = "Content-Type"
CONTENT_HEADER_VALUE = "application/json"

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def lambda_handler(event, context):
    results = {"results": []}
    for record in event['Records']:
        record_body = record["Sns"]
        notification = json.loads(record_body["Message"])
        print("Got Record Event: \n{}\n".format(notification))
        message_id = notification["message_id"]
        image_id = notification['key']
        scan_result = notification['scan_result']
        error_message = notification['error_message']
        results['results'].append(send_to_loader(image_id, scan_result, error_message))
    return {
        "statusCode": 200,
        "body": results
    }

def send_to_loader(imageId, scanResult, errorMessage):
    attempt = 0
    uri = "{}/{}".format(LOADER_URL,imageId)
    payload = {'status': 'FAILED', 'errorMessage': errorMessage}

    while attempt < RETRY_ATTEMPTS:
        print("Updating image upload status with imageId: {} ....\n".format(imageId))
        loader_response = requests.post(uri,
                                     headers={CONTENT_HEADER: CONTENT_HEADER_VALUE, ORIGIN_HEADER: ORIGIN_HEADER_VALUE,
                                              API_KEY_HEADER: API_KEY_HEADER_VALUE},
                                     data=payload,
                                     verify=False)

        if loader_response.status_code == 200 or loader_response.status_code == 202:
            print("...POST completed successfully in {} seconds\n".format(loader_response.elapsed.total_seconds()))
            return {imageId: loader_response.json()}
        else:
            print("Non 200/202 response received from api POST: {}, Reason: {}".format(loader_response.status_code, loader_response.reason))
            attempt += 1
            if attempt < RETRY_ATTEMPTS:
                print("Retrying: {} (attempt {} of {})...".format(imageId, attempt + 1, RETRY_ATTEMPTS))
            else:
                print("Aborting: {} after {} retries".format(imageId, RETRY_ATTEMPTS))
                raise Exception('Failed to update image upload status with imageId: {} after {} retries. '
                                '(Non 200/202 response received from api POST: {}, Reason: {})'
                                .format(imageId, RETRY_ATTEMPTS, loader_response.status_code, loader_response.reason))
