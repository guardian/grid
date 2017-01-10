#!/bin/bash

cd ../
sbt -J-Xdebug -J-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=9016 "project cropper" "run 9006"
