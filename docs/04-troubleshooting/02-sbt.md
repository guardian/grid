# SBT

## Compilation fails because dependencies that should exist cannot be found
- Kill all java process, then run `sbt clean` and `sbt clean-files`
- If this doesn't help, try removing all target files in the project and recompile
- If this still doesn't work, try cleaning ivy cache in ~/.ivy2.cache
