# CloudFormation scripts

These scripts require the [AWS CloudFormation Command Line Tools][1].

 [1]: http://aws.amazon.com/developertools/2555753788650372

## Troubleshooting

*An app server fails the ELB health check*

 * Check that the app server's security group allows ingress from the load balancer's security group
