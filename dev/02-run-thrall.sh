#!/bin/bash

cd ../
sbt -J-Xdebug -J-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=9012 "project thrall" "run 9002"
