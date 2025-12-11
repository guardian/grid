#!/usr/bin/env bash

set -e

(
    cd image-embedder-lambda
    npm install
    npm run bundle
    zip -r ../image-embedder.zip index.js
)