# CloudFormation scripts

These scripts require the [AWS CloudFormation Command Line Tools][1].

## Starting from scratch

These scripts are designed to let you create a whole stack from scratch, without pre-existing manually configured
security groups, etc.

First, create the base stack, which includes the security groups for each sub-stack:

    $ ./cloud-formation/create.sh PROD

Then, retrieve the name of the security group for a particular sub-stack, and use that to form the other parts of the
infrastructure:

    $ ./cloud-formation/find-security-group.sh elasticsearch PROD | xargs ./elasticsearch/cloud-formation/create.sh PROD

[1]: http://aws.amazon.com/developertools/2555753788650372
