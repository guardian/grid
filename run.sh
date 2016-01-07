#!/bin/bash

x-terminal-emulator -T elasticsearch -e '/bin/bash -c "cd elasticsearch; ./dev-start.sh"' &
x-terminal-emulator -T media-api     -e "sbt 'project media-api'    'run 9001'" &
x-terminal-emulator -T thrall        -e "sbt 'project thrall'       'run 9002'" &
x-terminal-emulator -T image-loader  -e "sbt 'project image-loader' 'run 9003'" &
x-terminal-emulator -T ftp-loader    -e "sbt 'project ftp-watcher'  'run 9004'" &
x-terminal-emulator -T kahuna        -e "sbt 'project kahuna'       'run 9005'" &
x-terminal-emulator -T cropper       -e "sbt 'project cropper'      'run 9006'" &
x-terminal-emulator -T usage         -e "sbt 'project usage'        'run 9009'" &
x-terminal-emulator -T collections   -e "sbt 'project collections'  'run 9010'" &
x-terminal-emulator -T metadata-editor -e "sbt 'project metadata-editor' 'run 9007'" &
x-terminal-emulator -T imgops        -e '/bin/bash -c "cd imgops; ./dev-start.sh"' &
