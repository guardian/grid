#!/bin/sh

echo Installing NPM dependencies
npm install
NPM_RC=$?
if [ $NPM_RC != "0" ]; then
    echo "##teamcity[message text='npm install error' status='ERROR']"
    exit $NPM_RC
fi

echo Installing JSPM packages
node_modules/.bin/jspm install
JSPM_RC=$?
if [ $JSPM_RC != "0" ]; then
    echo "##teamcity[message text='jspm install error' status='ERROR']"
    exit $JSPM_RC
fi
