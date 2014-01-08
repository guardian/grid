STAGE=`cat /etc/gu/stage | tr '[:upper:]' '[:lower:]'`

if [ "$STAGE" == "prod" ]
then
  DOMAIN_ROOT="media.***REMOVED***"
else
  DOMAIN_ROOT="media.$STAGE.dev-***REMOVED***"
fi

# session.domain is read by Play
APP_OPTIONS="-Dsession.domain=.$DOMAIN_ROOT -Ddomain.root=$DOMAIN_ROOT"

CMD="java $JVM_OPTIONS $APP_OPTIONS -jar $JAR"
echo "$CMD" > /home/media-service/logs/cmd.txt
$CMD > $LOGFILE 2>&1
