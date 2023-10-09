# NGINX

## NGINX returns "413 Request Entity Too Large"
Make sure you bump the maximum allowed body size in your nginx config (defaults to 1MB):

```
client_max_body_size 20m;
```

## NGINX, Play & SNI
As the Play Framework does not yet support [SNI](https://en.wikipedia.org/wiki/Server_Name_Indication)
 NGINX can't always work out which certificate to send where when there are multiple services on the same IP.
 This might result in NGINX sending the incorrect certificate resulting in a `HostnameVerifier Exception`.

## Resolution
When the correct cert to send is ambiguous, NGINX simply sends the first cert it sees in it's configuration,
which is loaded from config files in alphabetical order.

To resolve this problem, prefix your grid config filename with `0-`.

## Domain name bucket size
If you have multiple projects configured to use nginx to run locally, you may need to increase the [server_names_hash](http://nginx.org/en/docs/http/server_names.html) value in the nginx configuration file.

If you have this issue, you should see a message in this format in the terminal when running `dev-nginx restart` (and as part of the output for the start script):
```bash
nginx: [emerg] could not build server_names_hash, you should increase server_names_hash_bucket_size: 64
```

Note that the error above is telling you the **current** value not the **recommeneded** value. The sizes increase in powers of two, so you will most likely need to double the value shown in the warning (IE set to 128 is the current value is 64).

This does not prevent the start script from running the server, but opening https://media.local.dev-gutools.co.uk may give you a security error if nginx fails to provide the correct cerificate for the subdomain.

The configuration file will typically be at:
/usr/local/etc/nginx/nginx.conf

If not, run `dev-nginx locate` to get the path to your nginx folder.

To update the value, find the "http" section in the conf file. If there is a line specifing `server_names_hash_bucket_size`, double the current value, if not, add the following line (using the appropriate number: 128 is used below) at the top of the http block
`server_names_hash_bucket_size 128;`

After changing the nginx config file, run the setup script again.

example:

```conf
http {
    server_names_hash_bucket_size 128; # line to add or change
    include       mime.types;
    default_type  application/octet-stream;
    ...

    server {
      listen       8080;
      server_name  localhost;
      ...
    }
}
```
