#!/bin/sh

echo "ENV PARAMS"
echo $TEAMCITY_BUILD_PROPERTIES_FILE
cat $TEAMCITY_BUILD_PROPERTIES_FILE
echo "/ENV PARAMS"

# This will exec the CMD from your Dockerfile, i.e. "npm start"
exec "$@"
