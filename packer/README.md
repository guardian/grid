# Provisioning

We use [Packer](https://packer.io) to provision our AMIs. You will need this to
update the AMIs.

You will need your AWS credentials setup inline with the [AWS CLI Settings and
precedence](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html#config-settings-and-precedence)

Once you have made the changes to
[provisioning.json](./media-service/provisioning.json) you will need
to run:

    cd packer/media-service  # or imgops
    packer build provisioning.json

You will then be told something like:

    ==> Builds finished. The artifacts of successful builds are:
    --> media-service_ebd-storage-cfn: AMIs were created:

    eu-west-1: ami-cae55ebd

Use the AMI ID ⤴ in the
[CloudFormation script](../cloud-formation/media-service.json) where
applicable.

## AMIs in Currently Use

Currently the AMIs in use are:
- ami-161b9765: Plain Ubuntu Wily (Reaper, S3 Uploader)
- ami-41840c32: Ubuntu Wily with Nginx (ImgOps)
- ami-e827959b: Ubuntu Trusty (ES Cluster)
- ami-7129a102: Ubuntu Wily with GraphicsMagick and Pngquant (cropper)
- ami-e3f77990: Ubuntu Wily with GraphicsMagick (All other instances)

## Deregistering past AMIs

If you have provisioned a new AMI, be sure to clear up your mess and
[deregister your previous one](https://eu-west-1.console.aws.amazon.com/ec2/v2/home?region=eu-west-1#Images:sort=name)
and [delete its snapshot](https://eu-west-1.console.aws.amazon.com/ec2/v2/home?region=eu-west-1#Snapshots:sort=snapshotId)
