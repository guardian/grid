#!/bin/bash

if [ -z "$1" ]; then
    echo "Please supply a path to the Google Closure Compiler .jar"
    exit 1
fi

java -jar $1 --js mixpanel.js --js_output_file mixpanel.min.js --compilation_level ADVANCED_OPTIMIZATIONS --output_wrapper "(function() {
%output%
})();"

java -jar $1 --js mixpanel-jslib-snippet.js --js_output_file mixpanel-jslib-snippet.min.js --compilation_level ADVANCED_OPTIMIZATIONS

java -jar $1 --js mixpanel-jslib-snippet.js --js_output_file mixpanel-jslib-snippet.min.test.js --compilation_level ADVANCED_OPTIMIZATIONS --define='MIXPANEL_LIB_URL="../mixpanel.min.js"'
