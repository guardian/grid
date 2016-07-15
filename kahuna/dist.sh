#!/bin/sh

echo Clean up previous builds
npm run undist || { echo "##teamcity[message text='npm run undist error' status='ERROR']"; exit 1; }

echo Running tests
npm test || { echo "##teamcity[message text='npm test error' status='ERROR']"; exit 1; }

echo Building JSPM bundle
npm run dist || { echo "##teamcity[message text='npm run dist error' status='ERROR']"; exit 1; }
