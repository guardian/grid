#! /usr/bin/env sh

echo "Enter trust store password:"
read store_password

keytool -import \
  -file GuardianNewsandMediaCA.crt \
  -alias GuardianNewsandMediaCA \
  -keystore truststore.ts \
  -storepass $store_password
