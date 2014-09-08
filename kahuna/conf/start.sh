STAGE=`cat /etc/gu/stage | tr '[:upper:]' '[:lower:]'`

if [ "$STAGE" == "prod" ]
then
  SESSION_DOMAIN=".media.***REMOVED***"
else
  SESSION_DOMAIN=".media.$STAGE.dev-***REMOVED***"
fi

# session.domain is read by Play
APP_OPTIONS="-Dsession.domain=$SESSION_DOMAIN"

CMD="java $JVM_OPTIONS $APP_OPTIONS -jar $JAR"
echo "$CMD" > /home/media-service/logs/cmd.txt
$CMD > $LOGFILE 2>&1
