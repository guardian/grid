# NGINX

Grid consists of a number of micro services. Locally, we run each behind an NGINX proxy.

These proxies can be configured using the [`dev-nginx`](https://github.com/guardian/dev-nginx) tool,
and the configuration file [`nginx-mappings.yml`](../../nginx-mappings.yml):

```shell script
dev-nginx setup-app nginx-mappings.yml
```
