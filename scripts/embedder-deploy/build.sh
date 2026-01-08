#!/usr/bin/env bash

set -e

(
    cd image-embedder-lambda
    npm install
    npm run build
    cd dist
    zip -r ../../image-embedder.zip index.js
)