# GRID services and SSL

GRID services make HTTPS calls between themselves, and need a root certificate to do so.

## Generating certificate.

Installation is usually completed by setup (which calls dev-nginx)

In the event the certificate needs to be replaced / repaired, ensure JAVA_HOME is exported, and then run
```
mkcert -install
```
NB This will only install the certificate for the JAVA_HOME specified.

## Troubleshooting

In the event that this certificate (or its private key) is missing or damaged in some way,
the most likely result is a `com.amazonaws.SdkClientException` in logs and a failure banner in the UI.

## Example stack trace
```
com.amazonaws.SdkClientException: Unable to execute HTTP request:
  sun.security.validator.ValidatorException: PKIX path building failed:
  sun.security.provider.certpath.SunCertPathBuilderException: unable to find valid certification path to requested target
```

