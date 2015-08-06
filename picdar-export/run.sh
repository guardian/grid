#!/usr/bin/env bash

# TODO dynamically put in scala version
SCRIPT_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
java -jar $SCRIPT_DIR/target/scala-2.11/picdar-export-assembly-0.1.jar $@
