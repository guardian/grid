Troubleshooting
----------------

### Nginx returns "413 Request Entity Too Large"

Make sure you bump the maximum allowed body size in your nginx config (defaults to 1MB):

```
client_max_body_size 20m;
```

### Crops fail with a 500 HTTP error and an SSL error in the cropper logs

Make sure you install any certificate authority file needed in the
Java runtime for the cropper service to talk to the media-api.

You can do so with the `keytool` command:

```
$ sudo keytool -import \
               -trustcacerts \
               -alias internalrootca \
               -file rootcafile.cer \
               -keystore /path/to/global/jre/lib/security/cacerts
```

where `internalrootca` is the name you want to give the certificate in
your keystore, `rootcafile.cer` is the certificate file you want to
install (look for "dev-nginx/ssl/GNM-root-cert.pem"), and `/path/to/global/jre/lib/security/cacerts` the location
of the `cacerts` file for the JRE you're using.

On Mac OS X, it may be something like
`/Library/Java/JavaVirtualMachines/jdk1.8.0_25.jdk/Contents/Home/jre/lib/security/cacerts`;
on GNU Linux, it may be something like
`/usr/lib/jvm/java-1.8.0-openjdk-amd64/jre/lib/security/cacerts`.

### Compilation fails because existing libraries cannot be found
- Kill all java process
- Run `sbt clean` and `sbt clean-files`

### Authorisation error
- Restart auth

### Grid-runner
- When using grid-runner to run grid, individual services have to sometimes be restarted when switching branches
