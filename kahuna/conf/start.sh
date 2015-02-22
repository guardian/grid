DOMAIN_ROOT=`cat /etc/gu/domain-root`
SESSION_DOMAIN=".$DOMAIN_ROOT"

# session.domain is read by Play
APP_OPTIONS="-Dsession.domain=$SESSION_DOMAIN"

CMD="java $JVM_OPTIONS $APP_OPTIONS -jar $JAR"
echo "$CMD" > /home/media-service/logs/cmd.txt
$CMD > $LOGFILE 2>&1
