Media Service
=============

The new Guardian service to manage media (currently: images).

## Requirements

You will need to install:

* sbt
* JDK 7
* [bower](http://bower.io/)

Then run `setup.sh` to install and start Elasticsearch.  You can use
the script to start up Elasticsearch even if it's already installed.

Alternatively, you can do these steps manually:


## Install Elasticsearch

Run the Elasticsearch installer from the `elasticsearch` directory:

        $ cd elasticsearch/
        $ ./dev-install.sh


## Run Elasticsearch

Start Elasticsearch from the `elasticsearch` directory:

        $ cd elasticsearch/
        $ ./dev-start.sh


## Pan-domain authentication config

First you need to setup some properties to configure the
[pan-domain authentication](https://github.com/guardian/pan-domain-authentication)
in `/etc/gu/panda.properties`:

```
panda.domain=...
panda.aws.key=...
panda.aws.secret=...
```

This file will be used by the different applications to share auth
config, so that CORS is enabled across APIs.

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
domain.root=...
aws.id=...
aws.secret=...
s3.image.bucket=...
s3.thumb.bucket=...
auth.keystore.bucket=...
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
s3.thumb.bucket=...
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


## Run the FTP Watcher

Setup your local configuration in `/etc/gu/ftp-watcher.properties` to
point to the FTP server and your loader server:

```
ftp.host=...
ftp.user=...
ftp.password=...
loader.uri=http://localhost:9003/images
```

From the project root, run via sbt:

        $ sbt -Dftp.active=true
        > project ftp-watcher
        > run 9004

The FTP watcher should be up at
[http://localhost:9004/](http://localhost:9004/).

Images should appear in the Media API at [http://localhost:9001/images](http://localhost:9001/images).


## Run Kahuna

Setup your local configuration in `/etc/gu/kahuna.properties` to point
to the Media API:

```
domain.root=...
aws.id=...
aws.secret=...
auth.keystore.bucket=...
```

Run the `setup.sh` script from the kahuna directory to get started:

        $ cd kahuna
        $ ./setup.sh

Then, from the project root, run via sbt:

        $ sbt
        > project kahuna
        > run 9005

The user interface should be up at
[http://localhost:9005/](http://localhost:9005/).


## Run Cropper

Setup your local configuration in `/etc/gu/cropper.properties`:

```
domain.root=...
aws.id=...
aws.secret=...
auth.keystore.bucket=...
publishing.image.bucket=...
publishing.image.host=...
publishing.aws.id=...
publishing.aws.secret=...
sns.topic.arn=...
```

Add an API key for cropper to your key bucket:

```
# Create key file
$ CROPPER_KEY=cropper-`head -c 1024 /dev/urandom | md5sum | awk '{ print $1 }'`
$ echo Cropper > $CROPPER_KEY

# Upload to S3
# note: see `aws --profile media s3 ls | grep keybucket` output to find your bucket name
$ aws s3 cp $CROPPER_KEY s3://...YOUR_BUCKET_NAME.../
```

From the project root, run via sbt:

        $ sbt
        > project cropper
        > run 9006

The user interface should be up at
[http://localhost:9006/](http://localhost:9006/).


## Troubleshooting

### Nginx returns "413 Request Entity Too Large"

Make sure you bump the maximum allowed body size in your nginx config (defaults to 1MB):

```
client_max_body_size 20m;
```
