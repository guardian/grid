Media Service
=============

The new Guardian service to manage media (currently: images).


## Install Elasticsearch

Run the Elasticsearch installer from the `elasticsearch` directory:

        $ cd elasticsearch/
        $ ./dev-install.sh


## Run Elasticsearch

Start Elasticsearch from the `elasticsearch` directory:

        $ cd elasticsearch/
        $ ./dev-start.sh


## Run Media API

First you need to create some dev credentials and resources in AWS.

Log into the AWS Console (ask your friendly system administrator for a
link and credentials) and change to the EU (Ireland) availability zone.

Go to the CloudFormation console and add a new stack, call it
`media-service-DEV-{your-username}`, upload the template file from
`cloud-formation/dev-template.json` and create the stack.

Once created, select the stack and go to the Outputs tab; copy the
result into your local configuration in
`/etc/gu/media-api.properties`:

```
aws.id=...
aws.secret=...
s3.image.bucket=...
s3.thumb.bucket=...
sns.topic.arn=...
```

From the project root, run via sbt:

        $ sbt
        > project media-api
        > run

You may pass an argument to `run` to define which port to attach to, e.g.:

        > run 9001

The media api should be up at
[http://localhost:9001/](http://localhost:9001/).


## Run Thrall

Setup your local configuration in `/etc/gu/thrall.properties` using
outputs from the dev stack above:

```
aws.id=...
aws.secret=...
s3.image.bucket=...
sqs.queue.url=...
```

From the project root, run via sbt:

        $ sbt
        > project thrall
        > run 9002

The thrall should be up at
[http://localhost:9002/](http://localhost:9002/).


## Run the Image Loader

Setup your local configuration in `/etc/gu/image-loader.properties` using
outputs from the dev stack above:

```
aws.id=...
aws.secret=...
s3.image.bucket=...
s3.thumb.bucket=...
sns.topic.arn=...
```

From the project root, run via sbt:

        $ sbt
        > project image-loader
        > run 9003

The image loader should be up at
[http://localhost:9003/](http://localhost:9003/).

You can upload a test image to it using `curl`:

```
curl -X POST --data-binary @integration/src/test/resources/images/honeybee.jpg http://localhost:9003/images
```

It should then appear in the Media API at [http://localhost:9001/images](http://localhost:9001/images).
