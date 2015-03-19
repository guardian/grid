#!/bin/bash

# Change this to true to ingest images
FTP_ACTIVE=false
HOME=`pwd`

$HOME/elasticsearch/dev-start.sh | sed "s/^/[ELASTICSEARCH] /" &
$HOME/sbt 'project media-api' 'run 9001' | sed "s/^/[MEDIA_API] /" &
$HOME/sbt 'project thrall' 'run 9002' | sed "s/^/[THRALL] /" &
$HOME/sbt 'project image-loader' 'run 9003' | sed "s/^/[IMAGE_LOADER] /" &
$HOME/sbt -Dactive=$FTP_ACTIVE 'project ftp-watcher' 'run 9004' | sed "s/^/[FTP_WATCHER] /" &
$HOME/sbt 'project kahuna' 'run 9005' | sed "s/^/[KAHUNA] /" &
$HOME/sbt 'project cropper' 'run 9006' | sed "s/^/[CROPPER] /" &
$HOME/sbt 'project metadata-editor' 'run 9007' | sed "s/^/[METADATA_EDITOR] /" &

watch curl -s localhost:9001 localhost:9002 localhost:9003 localhost:9004 localhost:9005 localhost:9006 localhost:9007 > /dev/null

wait %1 %2 %3 %4 %5 %6 %7 %8
