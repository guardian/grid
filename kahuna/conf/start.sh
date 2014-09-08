STAGE=`cat /etc/gu/stage | tr '[:upper:]' '[:lower:]'`

if [ "$STAGE" == "prod" ]
then
  SESSION_DOMAIN=".media.gutools.co.uk"
else
  SESSION_DOMAIN=".media.$STAGE.dev-gutools.co.uk"
fi

# session.domain is read by Play
APP_OPTIONS="-Dsession.domain=$SESSION_DOMAIN"

CMD="java $JVM_OPTIONS $APP_OPTIONS -jar $JAR"
echo "$CMD" > /home/media-service/logs/cmd.txt
$CMD > $LOGFILE 2>&1
