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


## Deployment process for Guardian

A regular Riff Raff deploy of the app `usage` will deploy to both usage and usage-stream.
If you need to schedule one app deployment before the other (e.g. usage-stream before usage)
then use the Preview deployment page to select the specific app to deploy.
