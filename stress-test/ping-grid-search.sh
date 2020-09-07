#!/usr/bin/env bash

set +e

green='\x1B[0;32m'
red='\x1B[0;31m'
plain='\x1B[0m' # No Color

export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"

profile_param=test

accessGridRootInLoop() {
  while true; do
    total=$(grid image:get --profile $profile_param | jq .total)
    echo "accesing media-api /images endpoint with $total items"
  done
}

accessGridRootInLoop
