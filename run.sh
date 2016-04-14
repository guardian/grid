#!/bin/bash

# Convenience script to run all apps if you don't want to Docker

# Needs to be run inside tmux

tmux split-window "sbt 'project media-api'    'run 9001'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project thrall'       'run 9002'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project image-loader' 'run 9003'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project kahuna'       'run 9005'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project cropper'      'run 9006'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project usage'        'run 9009'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project metadata-editor' 'run 9007'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project collections' 'run 9010'"
tmux select-layout even-horizontal
tmux split-window "sbt 'project auth' 'run 9011'"
tmux select-layout even-horizontal

/bin/bash -c "cd elasticsearch; ./dev-start.sh"
