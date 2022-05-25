# Images

Grid acts as a library for still digital images. Users can upload images, where the metadata stored on the image will be parsed and made visible and searchable.

Grid currently supports uploads of [JPEG](https://en.wikipedia.org/wiki/JPEG), [PNG](https://en.wikipedia.org/wiki/Portable_Network_Graphics) and [TIFF](https://en.wikipedia.org/wiki/TIFF) images. A curated selection of metadata for all of these will be parsed on ingest, and entered into the Elasticsearch document. Similar metadata fields will be rationalised into a single field (for example, Grid's "Description" field will be formed from the first available of the `xmp-dc:description`, `iptc:Caption/Abstract` and `exif:Image Description` fields; see [this code](https://github.com/guardian/grid/blob/a67c3acbfbdd562ff560e301a25402293d48ca76/common-lib/src/main/scala/com/gu/mediaservice/lib/metadata/ImageMetadataConverter.scala#L57-L59)).

While users can "edit" metadata in the Grid UI, this will only be reflected in the Grid and never applied to any image.

Every image is assigned an ID on upload - this is the [SHA1 checksum](https://en.wikipedia.org/wiki/SHA-1) of the uploaded image. This usually prevents repeat uploads, but remember that any offline manipulation of the image _or its metadata_ will be treated by Grid as an entirely new image[^1].

> **Note**
> A future improvement may be to mark images as related, or to allow revisions of an image to be uploaded.
