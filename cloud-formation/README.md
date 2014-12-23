# CloudFormation scripts

These scripts require the [AWS CloudFormation Command Line Tools][1].

 [1]: http://aws.amazon.com/developertools/2555753788650372

## Troubleshooting

*An app server fails the ELB health check*

 * Check that the app server's security group allows ingress from the load
 balancer's security group


# Provisioning

We use [Packer](https://packer.io) to provision our AMIs. You will need this to
update the AMIs.

Once you have made the changes to [provisioning.json](./provisioning.json) you
will need to run:

    packer build \                                                                                                     ⏎ ✭ ✚ ✱
    -var 'aws_secret_key=YOUR_AWS_SECRET_Key' \
    -var 'aws_access_key=YOUR_AWS_ACCESS_KEY' \
    ./cloud-formation/provisioning.json

You will then be told something like:

    ==> Builds finished. The artifacts of successful builds are:
    --> media-service_ebd-storage-cfn: AMIs were created:

    eu-west-1: ami-cae55ebd

Use the AMI ID ⤴ in the [CloudFormation script](./media-service.json) where
applicable.
