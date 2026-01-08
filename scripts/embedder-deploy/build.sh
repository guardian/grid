#!/usr/bin/env bash

set -e

(
    cd image-embedder-lambda
    npm install
    npm run build
    zip -r dist/image-embedder.zip dist/index.js
)