#!/bin/bash

java -Xmx1536M -XX:+CMSClassUnloadingEnabled -XX:MaxPermSize=350m -jar $(dirname $0)/sbt-launch.jar "$@"

