#!/bin/bash

set -e

pushd lambda
npm install
popd

pushd scripts
npm install
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" node configure.js
popd
