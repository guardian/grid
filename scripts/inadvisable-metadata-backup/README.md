# Inadvidable Metadata Backup Tool

Suppose you found that a subset of images have been modified since upload and no longer have their exif/iptc/xmp metadata.

This is bad!

## Do not fear

We have the technology, we have the pertitnent metadata in elasticsearch.

This script fetches an image, backs it up to it's path + `_backup` in s3, and then fetches it's metadata from the grid using grid-cli.

It then uses exiftool to put pertinent metadata back in the image for reingestion, and the remainder of the data in a FileMetadata XMP tag.

## Running

Install the dependencies by running yarn.

Ensure [grid-cli](https://github.com/guardian/grid-cli) is installed and configured.

`AWS_PROFILE=$aws_profile ./run.sh $image_bucket $id`

Where `$aws_profile` is the AWS profile your bucket is in, `$image_bucket` is your image bucket and `$id` is the image.

### Extracting Metadata

`grid-cli image:download -d=. $id`
`yarn extract $id`
