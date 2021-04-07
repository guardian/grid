#!/usr/bin/env bash

set -e


if [ -z $1 ]
then
  echo "Please run this script with a PR number as its argument."
  exit 1
fi

PR=$1

echo "Pushing PR $PR to origin"
git fetch origin pull/${PR}/merge:pr${PR}
git push origin pr${PR}:pr${PR}
