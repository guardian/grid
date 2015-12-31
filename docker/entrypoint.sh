#!/bin/bash

cd /home/code
sbt "project $APP" "~ run 9000"
