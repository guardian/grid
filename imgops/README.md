# Img Opts for the Grid
Local version of the imgops service

## Requirements
* [Nginx with with image filter module](http://nginx.org/en/docs/http/ngx_http_image_filter_module.html)
  * Linux: `sudo apt-get install nginx nginx-extras`
  * Mac: `brew install homebrew/nginx/nginx-full --with-image-filter`
* [GD](http://libgd.github.io/)
  * Linux: `sudo apt-get install libgd-dev`
  * Mac:  `brew install gd`

## Installation
``` Bash
./dev-setup.sh YOUR_IMAGE_BUCKET
```

## Running
You should have the [dev-nginx](https://github.com/guardian/dev-nginx) repo checked out and set up.
``` Bash
cd PATH_TO/dev-nginx
sudo ./restart-nginx.sh
```

## Is it running

[](http://localhost:9008/_)

## Deploy
To see any changes that you make within the configuration propagate to
PROD / TEST you will need to update the Cloudformation script that spins up these
instances. __This is for local testing only__.
