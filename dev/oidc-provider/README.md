# OIDC Provider

This project defines the auth provider used locally when the grid has been set-up and started using the `--with-local-auth` flag, IE (from repo's root):
```bash
./dev/script/setup.sh --clean --with-local-auth
```
then
```bash
./dev/script/start.sh --with-local-auth
```

It is intended for **use in development only**.

See the docs for [set up](/docs/01-setup/03-running-setup.md#--with-local-auth) and [running the grid locally](/docs/02-running/01-running-locally.md#accessing-grid) for more details how to use this option.

## accessing application logs
The local-auth application will be running with docker - the log can be accessed by from the docker desktop application's 'containers' tab (click "oidc-provider-1" under "grid").

