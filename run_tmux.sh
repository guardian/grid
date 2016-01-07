#!/bin/bash

/bin/bash -c "cd imgops; ./dev-start.sh"

tmux split-window "sbt 'project media-api'    'run 9001'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project thrall'       'run 9002'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project image-loader' 'run 9003'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project ftp-watcher'  'run 9004'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project kahuna'       'run 9005'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project cropper'      'run 9006'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project usage'        'run 9009'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project metadata-editor' 'run 9007'"
tmux select-layout even-horizontal

/bin/bash -c "cd elasticsearch; ./dev-start.sh"
