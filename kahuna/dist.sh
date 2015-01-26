#!/bin/sh

echo Running tests
npm test || { echo "##teamcity[message text='npm test error' status='ERROR']"; exit 1; }

echo Building JSPM bundle
npm run dist || { echo "##teamcity[message text='jspm bundle error' status='ERROR']"; exit 1; }
