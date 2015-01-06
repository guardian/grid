#!/bin/bash

# Change this to true to ingest images
FTP_ACTIVE=false

x-terminal-emulator -T elasticsearch -e "cd elasticsearch; ./dev-start.sh" &
x-terminal-emulator -T media-api     -e "sbt 'project media-api'    'run 9001'" &
x-terminal-emulator -T thrall        -e "sbt 'project thrall'       'run 9002'" &
x-terminal-emulator -T image-loader  -e "sbt 'project image-loader' 'run 9003'" &
x-terminal-emulator -T ftp-loader    -e "sbt -Dactive=$FTP_ACTIVE
                                             'project ftp-watcher'  'run 9004'" &
x-terminal-emulator -T kahuna        -e "sbt 'project kahuna'       'run 9005'" &
x-terminal-emulator -T cropper       -e "sbt 'project cropper'      'run 9006'" &
x-terminal-emulator -T editor        -e "sbt 'project editor'       'run 9007'" &
