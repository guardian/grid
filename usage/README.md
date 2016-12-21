# Usages

Runs in one of two modes
- usage
- usage-stream

The mode is determined at start up time and is identified by the App tag on the EC2 instance.

usage
- Provides the API for the usage of an image. Gets information from a Dynamo table.

- usage-stream
- Reads from streams that have updates of content
- Updates the Dynamo table that usage mode uses

## Requirements

- Fill in the user.name property in `usage.properties` file
- For the first time you run the app, you will need to have cloudformation credentials from janus.


## Deploy process for Guardian

Currently the deploy process works fine for the usage app. The usage-stream app is deployed manually.

To deploy usage app:
- Go to Riff Raff and deploy the build number.

To deploy usage-stream:
- Use the Riff Raff and run the artifactUploadOnly recipe for the usage app.
- Manually increase the autoscaling group for usage-stream app and wait for a new instance
to be healthy in the load balancer.
- Manually terminate the old instance in the autoscaling group for usage-stream app
