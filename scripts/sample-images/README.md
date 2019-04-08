# sample-images

Upload random images from [Unsplash](https://unsplash.com/) into Grid.

## Setup
- Install dependencies `npm install`
- Register with the [Unsplash API](https://unsplash.com/developers) to get credentials
- Create a config file in `~/.gu/grid-sample-images-config.json` using [the template](./grid-sample-images-config.json.template)

## Running
- Run `npm run upload-sample-images`

You can optionally define the number of images to download (default is 1). For example downloading 5 images `npm run upload-sample-images 5`. Note, developer tier credentials on Unsplash are limited to 50 requests an hour. 

## Troubleshooting
If the instance of Grid is using a self-signed certificate, you'll first need to tell node where to find it by setting the `NODE_EXTRA_CA_CERTS` environment variable.

For example, if you're using [mkcert](https://github.com/FiloSottile/mkcert#using-the-root-with-nodejs), you can do `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" npm run upload-sample-images`
