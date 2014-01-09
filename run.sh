#!/bin/bash

# Change this to true to ingest images
FTP_ACTIVE=false

x-terminal-emulator -e "sbt 'project media-api'    'run 9001'" &
x-terminal-emulator -e "sbt 'project thrall'       'run 9002'" &
x-terminal-emulator -e "sbt 'project image-loader' 'run 9003'" &
x-terminal-emulator -e "sbt -Dactive=$FTP_ACTIVE
                            'project ftp-watcher'  'run 9004'" &
x-terminal-emulator -e "sbt 'project kahuna'       'run 9005'" &
x-terminal-emulator -e "sbt 'project cropper'      'run 9006'" &

# TODO: wake them all up using curl?
# TODO: optionally open in tabs, set title?
