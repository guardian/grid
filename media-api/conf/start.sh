CMD="java $JVM_OPTIONS -jar $JAR "
echo "$CMD" > /home/media-service/logs/cmd.txt
$CMD > $LOGFILE 2>&1
