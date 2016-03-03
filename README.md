Grid
====

[![Join the chat at https://gitter.im/guardian/grid](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/guardian/grid?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

**Grid** is [the Guardian](http://www.theguardian.com/)’s new **image
management system**, which provides a **universal** and **fast**
experience accessing media that is **organised** and using it in an
**affordable** way to produce **high-quality** content.

See the [Vision](VISION.md) document for more details on the core
principles behind this project.

![Screenshot of Grid search](docs/images/screenshot-2015-07-03T11:34:43.jpg)

Grid runs as a set of independent micro-services
([Scala](http://www.scala-lang.org/) and
[Play Framework](https://playframework.com/)) exposed as hypermedia
APIs ([argo](https://github.com/argo-rest/spec)) and accessed using a
rich Web user interface ([AngularJS](https://angularjs.org/)).

Grid relies on [Elasticsearch](https://www.elastic.co/) for
blazing-fast searching, and AWS services as additional storage and
communication mechanisms.


Running the applications
------------------------

### Requirements

You will need to install:

* sbt
* JDK 8
* Nginx
* [GraphicsMagick](http://www.graphicsmagick.org/)
`sudo apt-get install graphicsmagick` or `brew install graphicsmagick --with-little-cms2`.
* [awscli](https://aws.amazon.com/cli/)
* [jq](https://stedolan.github.io/jq/)
* [exiftool](http://www.sno.phy.queensu.ca/~phil/exiftool/)

If you're using OSX, you'll also need md5 `brew install md5`.

### Nginx

To run correctly in standalone mode we run behind nginx, this can be installed as follows:

1. Install nginx:
  * *Linux:*   ```sudo apt-get install nginx```
  * *Mac OSX:* ```brew install nginx```

2. Make sure you have a sites-enabled folder under your nginx home. This should be
  * *Linux:* ```/etc/nginx/sites-enabled```
  * *Mac OSX:* ```/usr/local/etc/nginx/```

3. Make sure your nginx.conf (found in your nginx home) contains the following line in the http{} block:
`include sites-enabled/*;`
  * you may also want to disable the default server on 8080

4. Get the [dev-nginx](https://github.com/guardian/dev-nginx) repo checked out on your machine

5. [Set up certs](https://github.com/guardian/dev-nginx#install-ssl-certificates) if you've not already done so

6. Configure the app routes in nginx

    sudo <path_of_dev-nginx>/setup-app.rb <path_of_media_service_repo>/nginx-mapping.yml

### Elasticsearch

You can run `setup.sh` to install and start Elasticsearch.  You can use
the script to start up Elasticsearch even if it's already installed.

Alternatively you can do these steps manually:

Run the Elasticsearch installer from the `elasticsearch` directory:

        $ cd elasticsearch/
        $ ./dev-install.sh

Start Elasticsearch from the `elasticsearch` directory:

        $ cd elasticsearch/
        $ ./dev-start.sh

### Create CloudFormation Stack

First you need to create some dev credentials in AWS - ask your friendly system administrator.

Setup your awscli with a new profile `aws configure --profile media-service`.

**Pro-tip**: Set `AWS_DEFAULT_PROFILE` to avoid using the `--profile` flag with the awscli in the future.

```sh
echo 'export AWS_DEFAULT_PROFILE=media-service' >> $HOME/.profile
```

To create your stack run [create-dev-stack.sh](cloud-formation/scripts/create-dev-stack.sh):

```sh
cd cloud-formation/scripts
./create-dev-stack.sh
```

### Generate .properties files

Generate your .properties files for the various media-service services using the
[dot-properties generator](./docker/configs/generators/README.md)

This will also create a ```panda.properties``` file that configures the
[pan-domain authentication](https://github.com/guardian/pan-domain-authentication)

This file will be used by the different applications to share auth
config, so that CORS is enabled across APIs.

Make sure you put the generated ```.properties``` files in
```/etc/gu/``` instead of ```~/.gu/``` as many apps do.


### Run the services
There are a few different ways to run the services, please see [here](./docs/running.md).


## Troubleshooting

### Nginx returns "413 Request Entity Too Large"

Make sure you bump the maximum allowed body size in your nginx config (defaults to 1MB):

```
client_max_body_size 20m;
```

### Crops fail with a 500 HTTP error and an SSL error in the cropper logs

Make sure you install any certificate authority file needed in the
Java runtime for the cropper service to talk to the media-api.

You can do so with the `keytool` command:

```
$ sudo keytool -import \
               -trustcacerts \
               -alias internalrootca \
               -file rootcafile.cer \
               -keystore /path/to/global/jre/lib/security/cacerts
```

where `internalrootca` is the name you want to give the certificate in
your keystore, `rootcafile.cer` is the certificate file you want to
install (look for "dev-nginx/ssl/GNM-root-cert.pem"), and `/path/to/global/jre/lib/security/cacerts` the location
of the `cacerts` file for the JRE you're using.

On Mac OS X, it may be something like
`/Library/Java/JavaVirtualMachines/jdk1.8.0_25.jdk/Contents/Home/jre/lib/security/cacerts`;
on GNU Linux, it may be something like
`/usr/lib/jvm/java-1.8.0-openjdk-amd64/jre/lib/security/cacerts`.
