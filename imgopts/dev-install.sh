#!/usr/bin/env bash
case $OSTYPE in
    linux*) OS="linux" ;;
    darwin*) OS="mac" ;;
    *) OS="unknown" ;;
esac

if [ $OS == "linux" ]; then
    sudo apt-get install gd
elif [ $OS == "mac" ]; then
    brew install gd
fi
