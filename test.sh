#!/bin/bash

sbt -Dloader.uri=http://localhost:9003 \
    -Dmediaapi.uri=http://localhost:9001 \
    "project integration" test
