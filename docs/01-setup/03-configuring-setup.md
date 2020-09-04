# Configuring `setup.sh`

There are a number of files and configuration needed to run Grid.
The [`setup.sh`](../../dev/script/setup.sh) script will do all the hard work!

`setup.sh` gets its config from the [`.env`](../../dev/.env) file.
In this doc, we describe the configuration options available.

## `DOMAIN`
**Default** `local.dev-gutools.co.uk`

By default, once setup and running, Grid's UI will be accessible on `media.local.dev-gutools.co.uk`.

Changing the value of `DOMAIN` will result in Grid being available on a different domain.
For example, a value of `example.com` will make Grid available on `media.example.com`.

One thing to note is the domain needs to resolve to `127.0.0.1`.
If needed, [`dev-nginx`](https://github.com/guardian/dev-nginx#add-to-hosts-file) can be used to add entries to `/etc/hosts`.
You'll need to add each subdomain Grid uses.

```shell script
DOMAIN=example.com

SUBDOMAINS=(
  'api.media'
  'loader.media'
  'media'
  'cropper.media'
  'media-metadata'
  'media-imgops'
  'media-usage'
  'media-collections'
  'media-auth'
  'media-leases'
  'es.media'
  'admin-tools.media'
  'thrall.media'
  'localstack.media'
  'public.media'
  'images.media'
)

for subdomain in "${SUBDOMAINS[@]}"; do
  dev-nginx add-to-hosts-file "$subdomain.$DOMAIN"
done
```

## `EMAIL_DOMAIN`
**Default** `guardian.co.uk`

Grid uses [pan-domain-authentication](https://github.com/guardian/pan-domain-authentication) to authenticate users.
If you decide to run a local authentication stack, this value is used during the authentication of the [default users](../../dev/config/users.json).

A value of `news.com` will result in a user `grid-demo-account@news.com`.
