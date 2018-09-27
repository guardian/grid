# Upversioning of clients to the Grid ElasticSearch database

There is a new ElasticSearch database available at internal-grid-LoadB-39NAR0Q63OTP-1351853328.eu-west-1.elb.amazonaws.com (at
the time of writing).

This is an ES6 database, populated via a lambda, reading from the SNS topic topic populated by image-loader.

The current build of media-api uses a 1.7 ES client.  It is not compatible with the new ES database (which uses a wire protocol
of 5+).  Thus to switch to the new database, it will be necessary to upversion the client.

At the same time, it will make sense to:

1. Switch to the REST client
1. Configure a load balancer name instead of the current discovery mechanism
1. Refactor common code into common-lib and common-lib-play

# Details

## Switch to the REST client

The ES wire client is deprecated.  *All* clients should move to the json REST client.

## Configure a load balancer name instead of the current discovery mechanism

As part of providing a REST service, all requests can now be mediated by an internal
http load balancer.  This has been built as part of the new DB stack.

## Refactor common code into common-lib and common-lib-play

Currently the code in common lib is appropriate for play apps only, and thus the lambda has
had to rely on a cut-and-pasted subset.  It will be useful to refactor for separate types.
