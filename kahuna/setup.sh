#!/bin/sh

echo Installing NPM dependencies
npm install
NPM_RC=$?
if [ $NPM_RC != "0" ]; then
    echo "##teamcity[message text='npm install error' status='ERROR']"
    exit $NPM_RC
fi
