#!/bin/bash

pushd elasticsearch
if [ ! -d elasticsearch ]
then
    echo Installing elasticsearch
    ./dev-install.sh
fi

# test if elasticsearch is running
wget -q -O/dev/null http://localhost:9200
if [ $? != 0 ]
then
    echo Starting elasticsearch...
    ./dev-start.sh
fi
popd

echo Setup complete, you may want to use run.sh to start all the services
