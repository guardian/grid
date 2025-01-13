#!/bin/bash

if [[ -n "$GRIDKEY" || -n "$GRIDDOMAIN" ]]; then
  echo "make sure to set env vars GRIDKEY and GRIDDOMAIN to run this script"
  exit 1
fi

# input file, stores all the ids that must be deleted
del=todelete.txt
# progress file, stores the id most recently successfully deleted
prog=progress.txt
# completion file, stores all ids successfully deleted
com=complete.txt
# errors file, stores all ids that could not be deleted
errs=errors.txt

touch $prog
touch $com
touch $errs

all="$(wc -l $del | awk '{ print $1 }' )"
ndone=0

# while skipping is "yes", we'll fastforward through the input file "todelete.txt"
# until we get to the id that was in the progress file. This way we won't reattempt
# any deletions that completed in a previous run, and we can quickly resume our
# previous status.
# (If instead you do want to start again from the beginning, simply remove the progress file!)
skipping=yes
last="$(cat $prog)"



while read id; do
  ndone=$((ndone + 1))
  if [[ $skipping = "yes" && -n "$last" && $id != $last ]]; then
    continue
  elif [[ $skipping = "yes" && -n "$last" ]]; then
    skipping=no
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
