#!/bin/bash

if [[ -n "$GRIDKEY" || -n "$GRIDDOMAIN" ]]; then
  echo "make sure to set env vars GRIDKEY and GRIDDOMAIN to run this script"
  exit 1
fi

del=todelete.txt
prog=progress.txt
com="complete.txt"
errs=errors.txt

touch $prog
touch $com
touch $errs

all="$(wc -l $del | awk '{ print $1 }' )"
ndone=0

skipping=1
last="$(cat $prog)"



while read id; do
  ndone=$((ndone + 1))
  if [[ $skipping = 1 && -n "$last" && $id != $last ]]; then
    continue
  elif [[ $skipping = 1 && -n "$last" ]]; then
    skipping=0
    continue
  else
    echo -n "deleting $id ($ndone / $all)... "
    if curl -fLso /dev/null -XDELETE -H "X-Gu-Media-Key: $GRIDKEY" "https://api.$GRIDDOMAIN/images/$id/hard-delete"; then
      echo $id > $prog
      echo $id >> $com
      echo "done"
    else
      echo "error $id"
      echo $id >> $errs
    fi
    sleep 0.2
  fi
done < $del
