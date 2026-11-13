#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! -f $1 ]]; then
  echo "Expected the path to the resolved im4java JAR" >&2
  exit 1
fi

jar=$1
url="https://repo.maven.apache.org/maven2/org/im4java/im4java/1.4.0/im4java-1.4.0.jar.sha1"
echo "Artifact: org.im4java:im4java:1.4.0"
echo "Resolved JAR: $jar"
echo "Algorithm: SHA-1 (Maven Central does not publish SHA-256 for this artifact)"
echo "Checksum URL: $url"

expected=$(curl --fail --silent --show-error --location --retry 3 "$url")
if [[ ! $expected =~ ^[[:xdigit:]]{40}$ ]]; then
  echo "Invalid SHA-1 checksum from Maven Central: $expected" >&2
  exit 1
fi

actual=$(shasum -a 1 "$jar")
actual=${actual%% *}
echo "Expected SHA-1: $expected"
echo "Calculated SHA-1: $actual"
if [[ $(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]') != "$actual" ]]; then
  echo "im4java checksum mismatch" >&2
  exit 1
fi
echo "im4java checksum matches Maven Central"
