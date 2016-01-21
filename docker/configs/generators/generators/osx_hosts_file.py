import os
from . import *

DOCKER_HOST = 'DOCKER_HOST'


def get_docker_host_ip():
    if os.environ.has_key(DOCKER_HOST):
        return os.environ.get(DOCKER_HOST).replace('tcp://', '').split(':')[0]
    else:
        print 'Cannot connect to the Docker daemon. Is the docker daemon running on this host?'


def generate():
    ip = get_docker_host_ip()

    if not ip:
        return

    domain = get_domain()

    for mapping in get_mappings():
        print '{ip} {prefix}.{domain}'.format(ip=ip, prefix=mapping.get('prefix'), domain=domain)


if __name__ == '__main__':
    generate()
