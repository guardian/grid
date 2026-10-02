FROM mcr.microsoft.com/devcontainers/base:ubuntu26.04

USER root
COPY .host-certs/root-ca.crt /usr/local/share/ca-certificates/host-root-ca.crt
RUN update-ca-certificates