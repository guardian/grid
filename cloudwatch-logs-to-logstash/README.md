# Cloud Watch Logs to Logstash

Lambdas store their logs in Cloud Watch Logs. Most services within the Grid will push their logs to our [ELK stack](https://github.com/guardian/machine-images/blob/master/cloudformation/elk-stack.json).
For simplicity of log browsing, Cloud Watch Logs to Logstash pushes Cloud Watch Logs into Logstash via a Lambda that is subscribed to a Cloud Watch Log Group.

Cloud Watch Logs to Logstash expects a Cloud Watch Logs log-line to look like:

```json
{
    "stage": "PROD",
    "stack": "media-service",
    "app": "foo-bar",
    "timestamp": "2015-12-14T11:27:54.476Z",
    "level": "ERROR",
    "message": "An error occurred.",
    "state": {
        "foo": "bar"
    }
}
```

Where `state` can be of any shape. For example, [S3Watcher](../s3watcher/lambda/lib/Logger.js).

Cloud Watch Logs to Logstash will then take this message and push it onto the Kinesis stream in the ELK stack, which in turn pushes it into Logstash.

## Developing
This lambda puts messages to a Kinesis stream. When run from within the AWS environment, the Lambda gets credentials from an execution role.
In DEV, we can use our local credentials from `~/.aws/credentials` by setting the value `stage` to `DEV` in `lambda/config.json`;


## Deploying
This Lambda has not been added to CI/CD due to the slight complexity of getting secrets into the Lambda.

To deploy, run `./deploy.sh` then update the Lambda function code.
