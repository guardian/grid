#!/usr/bin/env bash

set -e

(
    cd cdk
    npm ci
    npm run lint
    npm run test
    npm run synth
)