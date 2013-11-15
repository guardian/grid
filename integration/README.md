# Integration Testing

## Running against AWS

Our test harness uses the AWS API (as the user "integration") to locate the endpoints of the system under test. This
assumes a CloudFormation stack exists with the name "media-service-TEST", and the following outputs:

 * "MediaApiLoadBalancer": Media API load balancer DNS
 * "ImageLoaderLoadBalancer": Image Loader API load balancer DNS

## Running on a development machine

    $ sbt -Dloader.uri=http://localhost:9000 -Dmediaapi.uri=http://localhost:9002 "project integration" test
