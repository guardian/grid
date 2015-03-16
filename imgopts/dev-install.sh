#!/usr/bin/env bash
case $OSTYPE in
    linux*) OS="linux" ;;
    darwin*) OS="mac" ;;
    *) OS="unknown" ;;
esac

if [ $OS == "linux" ]; then
    sudo apt-get install gd
    sudo apt-get remove nginx*
elif [ $OS == "mac" ]; then
    brew install gd
    brew remove nginx
fi
