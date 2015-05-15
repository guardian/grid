#!/usr/bin/env bash

BUILD_LOCAL=$1
SBT_CMD="sbt-tc"

# Option to use plain sbt when not building in teamcity
if [ "$BUILD_LOCAL" = "local" ]; then
    SBT_CMD="sbt"
fi

# Run sbt to generate artifacts.zip
SBT_BUILD_CMD="$SBT_CMD \"project cropper\" test dist"

echo "Running '$SBT_BUILD_CMD'"
eval $SBT_BUILD_CMD

cd cropper

# Copy profiles into target location
mkdir -p target/packages/cropper
cp -r icc_profiles target/packages/cropper

# Append icc_profiles to zip
cd target; zip -g artifacts.zip packages/cropper/icc_profiles/*
