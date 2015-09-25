#!/bin/bash

cd ../
sbt -J-Xdebug -J-Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=9015 "project kahuna" "run 9005"
