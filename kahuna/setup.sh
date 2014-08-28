#!/bin/sh

echo Installing NPM dependencies
npm install

echo Installing JSPM packages
node_modules/.bin/jspm install
