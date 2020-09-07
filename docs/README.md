# Table Of Contents
*(Do NOT edit manually. Generated using generate-toc.sh)*

## [About](00-about/)
- [Vision](00-about/01-vision.md)

## [Setup](01-setup/)
- [Software dependencies](01-setup/01-software-dependencies.md)
- [AWS dependencies](01-setup/02-aws-dependencies.md)
- [Configuring `setup.sh`](01-setup/03-configuring-setup.md)
- [Running setup](01-setup/03-running-setup.md)

## [Running](02-running/)
- [Running locally](02-running/01-running-locally.md)
- [Kahuna](02-running/02-kahuna.md)
- [Accessing logs](02-running/03-logging.md)

## [Apis](03-apis/)
- [Authentication](03-apis/01-authentication.md)
- [Collections](03-apis/02-collections.md)

## [Troubleshooting](04-troubleshooting/)
- [NGINX](04-troubleshooting/01-nginx.md)
- [SBT](04-troubleshooting/02-sbt.md)
- [Authentication](04-troubleshooting/03-authentication.md)

## [Reingestion](05-reingestion/)
- [Image reingestion](05-reingestion/01-how-to.md)

## [Archives](99-archives/)
- [DEV Cloudformation Setup](99-archives/01-cloudformation.md)
- [DEV Setup](99-archives/02.01-dev-setup.md)
- [Configuration](99-archives/02.02-configuration.md)
- [Running services](99-archives/03-running.md)
- [Grid API](99-archives/04.01-api.md)
- [Authentication](99-archives/04.02-authentication.md)
- [Upload Image Directly](99-archives/04.03-upload-image.md)
- [Start Thrall](99-archives/04.04-start-thrall.md)
- [Media API](99-archives/04.05-media-api.md)
- [Logging](99-archives/05-logging.md)
- [Troubleshooting](99-archives/TROUBLESHOOTING.md)
- [Migration to Elasticsearch 6](99-archives/elasticsearch6.md)
- [Migration to Elasticsearch 7](99-archives/elasticsearch7.md)
- [Local kinesis](99-archives/local-kinesis.md)


---
# META: How to create a new documentation file

## Documentation conventions

- Find the correct subdirectory your new documentation file belongs to.
- Every documentation file should be markdown (with .md extension).
- First line of every documentation file should contain its title (used to generated the table of content).
- Store all the images in an `/images` subfolder in the same directory the document referencing them will be.

