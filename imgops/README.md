# ImgOps for the Grid
Local version of the imgops service

## Requirements
* [GD](http://libgd.github.io/)
  * Linux: `sudo apt-get install libgd-dev`
  * Mac:  `brew install gd`
* [Nginx with with image filter module](http://nginx.org/en/docs/http/ngx_http_image_filter_module.html)
  * Linux: `sudo apt-get install nginx nginx-extras`
  * Mac: `brew tap denji/nginx && brew install nginx-full --with-image-filter`

## Running
Imgops runs in a Docker container. It can be run using the command:

```bash
docker-compose up -d imgops
```

## Is it running

```bash
curl -I http://localhost:9008/_
```

## Deploy
To see any changes that you make within the configuration propagate to
PROD / TEST you will need to update the Cloudformation script that spins up these
instances. __This is for local testing only__.
