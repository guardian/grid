#!/usr/bin/env bash

set -e


if [ $# -eq 0 ]
then
  echo "Please run this script with a PR number as its argument."
  exit 1
fi

PR=$0

echo "Pushing PR $PR to origin"
git fetch origin pull/${PR}/merge:pr${PR}
git push origin pr${PR}:pr${PR}
