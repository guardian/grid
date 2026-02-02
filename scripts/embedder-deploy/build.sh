#!/usr/bin/env bash

set -e

(
    cd image-embedder-lambda
    npm ci
    # Install sharp's native bindings for the lambda target architecture (linux-arm64)
    npm install --os=linux --cpu=arm64 sharp
    npm run build
    cd dist
    zip -r ../../image-embedder.zip index.js
)