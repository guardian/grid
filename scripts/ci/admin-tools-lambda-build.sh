#!/usr/bin/env bash

set -e

sbt ";project admin-tools-lambda; assembly; riffRaffUpload"
