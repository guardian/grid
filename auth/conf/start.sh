DOMAIN_ROOT=`cat /etc/gu/domain-root`
SESSION_DOMAIN=".$DOMAIN_ROOT"

APP_SECRET=`cat /etc/gu/play-application-secret`

# session.domain and application.secret are read by Play
APP_OPTIONS="-Dsession.domain=$SESSION_DOMAIN -Dapplication.secret=$APP_SECRET"

CMD="java $JVM_OPTIONS $APP_OPTIONS -jar $JAR"
echo "$CMD" > /home/media-service/logs/cmd.txt
$CMD > $LOGFILE 2>&1
