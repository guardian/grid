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

### Compilation fails because depencies that should exist cannot be found
- Kill all java process, then run `sbt clean` and `sbt clean-files`
- If this doesn't help, try removing all target files in the project and recompile
- If this still doesn't work, try cleaning ivy cache in ~/.ivy2.cache

### Authorisation error
- Restart auth

### Grid-runner
- When using grid-runner to run grid, individual services have to sometimes be restarted when switching branches

### Accepting certificates
- You have to manually accept the certificates for the urls for the different grid services.
- To do this, go the network tab and look for request that failed with error `net::ERR_INSECURE_RESPONSE`
- Click on the url the request was made to and accept the certificate
- Not being able to access the services can lead to a lot of errors showing up on the client so you might
have spend some time searching for the original error that caused the problems
