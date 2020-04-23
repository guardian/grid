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
