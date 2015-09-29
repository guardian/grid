#!/usr/bin/env python

import argparse
import requests
import urllib
import logging

logging.basicConfig(format='%(asctime)s %(name)s %(levelname)s %(message)s',
                    level=logging.INFO, filename='reaper.log')

LOGGER = logging.getLogger('reaper')

for handler in logging.root.handlers:
    handler.addFilter(logging.Filter('reaper'))


def _get_headers(api_key):
    return { 'X-Gu-Media-Key': api_key }


def _perform_get(media_api, api_key, until, length):
    query_params = {
        'until': until,
        'length': length,
        'persisted': False
    }

    headers = _get_headers(api_key)

    url = '{0}/images?{1}'.format(media_api, urllib.urlencode(query_params))

    # verify=False to forcefully ignore SSL verification in DEV, which will fail due to cert using custom CA.
    return requests.get(url, headers=headers, verify=False).json()


def _extract_uris(api_response):
    return [image['uri'] for image in api_response['data']]


def _perform_delete(uris, api_key, dry_run):
    headers = _get_headers(api_key)

    for uri in uris:
        LOGGER.info('DELETE {}'.format(uri))
        if not dry_run:
            # verify=False to forcefully ignore SSL verification in DEV, which will fail due to cert using custom CA.
            requests.delete(uri, headers=headers, verify=False)


def reap(media_api, api_key, until='20.days', length=100, dry_run=False):
    get_response = _perform_get(media_api, api_key, until, length)
    uris = _extract_uris(get_response)
    _perform_delete(uris, api_key, dry_run)


def _parse_args():
    parser = argparse.ArgumentParser(description='Reaper')
    parser.add_argument('--media-api', help='Media API', required=True)
    parser.add_argument('--api-key', help='API Key', required=True)
    parser.add_argument('--until', help='Until param', default='20.days', type=str)
    parser.add_argument('--length', help='Length param', default=100, type=int)

    parser.add_argument('--dry-run',
                        help='Log effects only, do not perform DELETE',
                        dest='dry_run', action='store_true')

    parser.set_defaults(dry_run=False)

    return parser.parse_args()


if __name__ == '__main__':
    args = _parse_args()
    reap(**vars(args))
