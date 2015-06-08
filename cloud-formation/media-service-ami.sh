#!/bin/bash

function new_section {
  echo
  echo $(date +"%F %T") $1
  echo "----------------------------------------------------------------------------------------"
}

set -e

new_section "Moving config files into place"
mv /tmp/media-service_logrotate /etc/logrotate.d/media-service
sudo chown root:root /etc/logrotate.d/media-service

new_section "Updating package lists"
apt-get -y update

new_section "Installing graphicsmagick"
apt-get -y install graphicsmagick graphicsmagick-imagemagick-compat

new_section "Installing cloud watch monitoring scripts"
apt-get -y install unzip libwww-perl libdatetime-perl
wget "http://aws-cloudwatch.s3.amazonaws.com/downloads/CloudWatchMonitoringScripts-1.2.1.zip" -O /tmp/CloudWatchMonitoringScripts.zip
unzip /tmp/CloudWatchMonitoringScripts.zip -d /tmp/
rm /tmp/CloudWatchMonitoringScripts.zip
mv /tmp/aws-scripts-mon /usr/local/

new_section "Adding disk available cronjob"
disk_space_available="*/5 * * * * /usr/local/aws-scripts-mon/mon-put-instance-data.pl --disk-space-avail --mem-avail --disk-path /dev/xvda1 --auto-scaling --from-cron"
echo "$disk_space_available" | crontab -u root -
