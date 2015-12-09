#!/bin/bash

set -e

pushd lambda
npm install
popd

pushd scripts
npm install
node configure.js
popd
