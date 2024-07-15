#!/bin/bash

isFastForwarding=true

touch lastQueriedId.txt
lastQueriedId=$(cat lastQueriedId.txt)

if [[ $lastQueriedId == "" ]]
  then isFastForwarding=false
fi

while read line; do
  id=$(echo "$line" | cut -d "," -f 1)
  path=$(echo "$line" | cut -d "," -f 2)

  if [[ $lastQueriedId == "$id" ]]
    then isFastForwarding=false
    continue
  fi

  if [[ $isFastForwarding == 'true' ]]
    then continue
  fi

#  only gets to this if isFastForwarding is false
  if curl "https://media-usage.test.dev-gutools.co.uk/usages/digital/content/$path/reindex" -H "X-Gu-Media-Key: $GRID_API_KEY" -f
    then
    echo "$id" > lastQueriedId.txt
    echo "Reindexed id: $id, path: $path"
  else
    echo "$id,$path" >> failedIds.txt
    echo "Failed on id: $id, path: $path"
  fi

done < codeContentIdAndPath.csv
