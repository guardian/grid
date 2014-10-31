#!/bin/bash

# Change this to true to ingest images
FTP_ACTIVE=false

x-terminal-emulator -T media-api    -e "sbt 'project media-api'    'start 9001'" &
x-terminal-emulator -T thrall       -e "sbt 'project thrall'       'start 9002'" &
x-terminal-emulator -T image-loader -e "sbt 'project image-loader' 'start 9003'" &
x-terminal-emulator -T ftp-loader   -e "sbt -Dactive=$FTP_ACTIVE
                            'project ftp-watcher'  'start 9004'" &
x-terminal-emulator -T kahuna       -e "sbt 'project kahuna'       'start 9005'" &
x-terminal-emulator -T cropper      -e "sbt 'project cropper'      'start 9006'" &
x-terminal-emulator -T editor       -e "sbt 'project editor'       'start 9007'" &
