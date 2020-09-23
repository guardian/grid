# Authentication

## 4XX response when calling Grid APIs from the outside
If you're trying to make requests to Grid's API from the outside,
you may find Grid returns with a `403` even though you're sending a valid cookie with the request.

This is due to the [security filters](https://www.playframework.com/documentation/2.6.x/Filters) in use.
We'll need to configure Grid to allow requests from the outside by setting `security.cors.allowedOrigins` in the config files located in `/etc/grid` in production and `~/.grid` when developing locally.

Once configured, Grid will trust requests which include the [`Origin` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin)
set to one of the domains specified, if they also include a valid cookie, of course!

Note: the [generate-config](../../dev/script/generate-config) script can be used to create the config files in `~/.grid/`.
Refer to [it's configuration](../../dev/script/generate-config/config.json5) to set `security.cors.allowedOrigins`.
