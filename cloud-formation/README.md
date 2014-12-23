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

You will need your AWS credentials setup inline with the [AWS CLI Settings and
precedence](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#config-settings-and-precedence)

Once you have made the changes to [provisioning.json](./provisioning.json) you
will need to run:

    packer build ./cloud-formation/provisioning.json

You will then be told something like:

    ==> Builds finished. The artifacts of successful builds are:
    --> media-service_ebd-storage-cfn: AMIs were created:

    eu-west-1: ami-cae55ebd

Use the AMI ID ⤴ in the [CloudFormation script](./media-service.json) where
applicable.


## Deregistering past AMIs

If you have provisioned a new AMI, be sure to clear up your mess and
[deregister your previous one](https://eu-west-1.console.aws.amazon.com/ec2/v2/home?region=eu-west-1#Images:sort=name)
and [delete it's snapshot](https://eu-west-1.console.aws.amazon.com/ec2/v2/home?region=eu-west-1#Snapshots:sort=snapshotId)
