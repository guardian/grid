DOMAIN_ROOT=`cat /etc/gu/domain-root`
SESSION_DOMAIN=".$DOMAIN_ROOT"

APP_SECRET=`cat /etc/gu/play-application-secret`

# session.domain and application.secret are read by Play
APP_OPTIONS="-Dsession.domain=$SESSION_DOMAIN -Dapplication.secret=$APP_SECRET"

CMD="$USER_HOME/bin/$APP"
echo "$CMD" > $USER_HOME/logs/cmd.txt
$CMD > $LOGFILE 2>&1
