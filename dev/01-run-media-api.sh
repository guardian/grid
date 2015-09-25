#!/bin/bash

cd ../
sbt -J-Xdebug -J-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=9011 "project media-api" "run 9001"
