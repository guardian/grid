import os
from . import *

DOCKER_HOST='DOCKER_HOST'


class DaemonConnectError(Exception):
    def __init__(self):
        self.message = "Cannot connect to the Docker daemon. Is the docker daemon running on this host?"


def get_docker_host_ip():
    if not os.environ.has_key(DOCKER_HOST):
        raise DaemonConnectError()

    return os.environ.get(DOCKER_HOST).replace('tcp://', '').split(':')[0]


def mapping_to_domain(mapping):
    return [mapping.get('prefix'), get_domain()].join('.')


def generate():
    ip = get_docker_host_ip()
    domain = get_domain()

    for mapping in get_mappings():
        print '{ip} {prefix}.{domain}'.format(ip=ip, prefix=mapping.get('prefix'), domain=domain)


if __name__ == '__main__':
    try:
        generate()
    except Exception, e:
        print e.message
