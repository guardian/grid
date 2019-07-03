#!/usr/bin/env bash

set -e

green='\x1B[0;32m'
red='\x1B[0;31m'
plain='\x1B[0m' # No Color

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR=${DIR}/..

if [[ $# -lt 1 ]]
then
  echo "Usage: $0 STACK_NAME"
	exit 1
fi

STACK_NAME=$1

brewInstall() {
  brew bundle --file=${ROOT_DIR}/Brewfile
}

setupNginx() {
  dev-nginx setup-app ${ROOT_DIR}/nginx-mappings.yml
}

setupImgops() {
  if [[ ! -f ${ROOT_DIR}/imgops/dev/nginx.conf ]]; then
    bucket=`bash get-stack-resource.sh ImageBucket`
    if [[ -z "$bucket" ]]; then
      echo -e "${red}Cannot get ImageBucket.${plain}"
      echo -e "Please ensure:"
      echo -e "- Your AWS CloudFormation stack ${STACK_NAME} has been successfully created"
      echo -e "- You have a media-service profile for the aws cli with a default region"
      exit 1
    fi

    sed -e 's/{{BUCKET}}/'${bucket}'/g' ./imgops/dev/nginx.conf.template > ./imgops/dev/nginx.conf
  fi
}

fileExists() {
  test -e "$1"
}

setNodeVersion() {
  if [[ ! -f ${NVM_DIR}/nvm.sh ]]; then
    node_version=`cat .nvmrc`
    echo -e "${red}nvm not found ${plain} NVM is required to run this project"
    echo -e "Install it from https://github.com/creationix/nvm#installation"
    exit 1
  else
    source "$NVM_DIR/nvm.sh"
    nvm use
  fi
}

setupJS() {
  pushd ${ROOT_DIR}/kahuna
  npm install
  popd
}

main() {
  brewInstall
  setupImgops
  setupNginx
  setNodeVersion
  setupJS
}

main
echo "Done. Please setup your config files now. Instructions here - ${DIR}/generate-dot-properties/README.md"
