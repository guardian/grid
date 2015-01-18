#!/bin/sh

echo Running tests
npm test || { echo "##teamcity[message text='npm test error' status='ERROR']"; exit 1; }

echo Building JSPM bundle
node_modules/.bin/jspm bundle js/main public/js/dist/build.js -m --inject

JSPM_RC=$?
if [ $JSPM_RC != "0" ]; then
    echo "##teamcity[message text='jspm bundle error' status='ERROR']"
    exit $JSPM_RC
fi
