# Quarantine Alert Status Lambda

An AWS Lambda to consume SNS (Quarantine processor pushes positive status events to it)  events and update image upload status
through the [image-loader](../image-loader) service `POST    /uploadStatus/:imageId`.
