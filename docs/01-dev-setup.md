# DEV Setup

## Requirements
Ensure you have the following installed:
- sbt
- Java 8
- [GD](http://libgd.github.io/)
- nginx with the [image filter module](http://nginx.org/en/docs/http/ngx_http_image_filter_module.html) (`brew install homebrew/nginx/nginx-full --with-image-filter`)
- GraphicsMagick with `little-cms2` (`brew install graphicsmagick --with-little-cms2`)

### Optional requirements
- [awscli](https://aws.amazon.com/cli/)
- [jq](https://stedolan.github.io/jq/)
- [exiftool](http://www.sno.phy.queensu.ca/~phil/exiftool/)

## Elasticsearch
We use a local elasticsearch instance which can be installed by running:

```bash
./elasticsearch/dev-install.sh
```

## Client side dependencies
Client side dependencies can be installed by running:

```bash
./kahuna/setup.sh
```

## Nginx
To run correctly in standalone mode we run each micro-service behind an nginx site.

Use [nginx-mappings.yml](../nginx-mappings.yml) along with [dev-nginx](https://github.com/guardian/dev-nginx)
to generate the nginx configs.

Note: Although [dev-nginx](https://github.com/guardian/dev-nginx) is an *internal* repository,
it uses [nginx-mappings.yml](../nginx-mappings.yml) to generate a configuration within `sites-enabled` similar to:

```
server {
  listen 443;
  server_name <PREFIX>.example.co.uk;

  location / {
    proxy_pass http://localhost:<PORT>;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_redirect default;
  }

  ssl on;
  ssl_certificate /path/to/cert.crt;
  ssl_certificate_key /path/to/cert.key;
  ssl_session_timeout 5m;
  ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;
}

server {
  listen 80;
  server_name <PREFIX>.example.co.uk;

  # redirect all HTTP traffic to HTTPS
  return 301 https://$host$request_uri;
}
```

### NGINX, Play & SNI
As the Play Framework does not yet support [SNI](https://en.wikipedia.org/wiki/Server_Name_Indication)
 NGINX can't always work out which certificate to send where when there are multiple services on the same IP. 
 This might result in NGINX sending the incorrect certificate resulting in a `HostnameVerifier Exception`.

#### Resolution

When the correct cert to send is ambiguous, NGINX simply sends the first cert it sees in it's configuration, 
which is loaded from config files in alphabetical order.

To resolve this problem, prefix your grid config filename with `0-`.

## DEV Cloudformation Stack
Use the [cloudformation template](../cloud-formation/dev-template.json) to create the resources needed for a DEV environment. 

## .properties files
Once you have a DEV stack running, you can generate the necessary`.properties` configuration files in `/etc/gu`.

This can be done by following the instructions [here](./docker/configs/generators/README.md).

Guardian devs can follow the guide in the dev-utils folder of this private [repo](https://github.com/guardian/grid-infra).
This will give you some tips about our specific configuration.
