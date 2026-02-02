#!/usr/bin/env bash

set -e

(
    cd image-embedder-lambda
    npm ci
    # Install sharp's native bindings for the lambda target architecture (linux-arm64)
    npm install --cpu=arm64 --os=linux --libc=glibc sharp
    npm run build

    # Copy sharp and all its dependencies into dist for packaging
    mkdir -p dist/node_modules/@img
    cp -r node_modules/sharp dist/node_modules/
    cp -r node_modules/@img/sharp-linux-arm64 dist/node_modules/@img/
    cp -r node_modules/@img/sharp-libvips-linux-arm64 dist/node_modules/@img/
    cp -r node_modules/@img/colour dist/node_modules/@img/
    # Sharp's JS dependencies
    cp -r node_modules/detect-libc dist/node_modules/
    cp -r node_modules/semver dist/node_modules/

    cd dist
    zip -r ../../image-embedder.zip .
)