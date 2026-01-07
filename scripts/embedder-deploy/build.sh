#!/usr/bin/env bash

set -e

(
    cd image-embedder-lambda
    npm install
    npm run build
    zip -r ../image-embedder.zip index.js
)