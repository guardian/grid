# Developing on the Grid

This directory contains a shell script to launch each service individually, for example `./00-run-elastic-search.sh` will start your elasticsearch cluster.

## Interactive Debugging
The scripts that run sbt will also add debug flags to the jvm so that you can interactively debug using [IntelliJ](https://www.jetbrains.com/idea/help/run-debug-configuration-remote.html).
Their debug ports are correspond to their application port +10. For example, `media-api` runs on port `9001` and its debug port is set to `9011`.

To start interactively debugging, [add a remote debug configuration to Intellij](https://www.jetbrains.com/idea/help/run-debug-configuration-remote.html) (one per service) and set their ports accordingly.

## iTerm2
Using iTerm2? Why not [setup a profile](http://chris-schmitz.com/develop-faster-with-iterm-profiles-and-window-arrangements/) for each script, then save it as a window arangement.
