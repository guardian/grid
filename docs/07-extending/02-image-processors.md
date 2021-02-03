Image Processor provider pipelines
==================================

When an image is loaded into the Grid (either via the user interface or automatically via an external API call) the Grid
extracts source metadata (XMP, IPTC and others) from the image. This data is stored in the database and also assigned to
primary metadata fields (a reduced subset of what the Grid considers to be the key metadata fields - these are displayed
to users and many are editable).

The way that these primary metadata fields are populated is currently in code, but once they have been populated and
before they are stored in the database the Grid runs the `Image` through a pipeline of `ImageProcessors` which are able
to further process the image metadata to classify images and improve the metadata.

For example, at the Guardian, we examine the metadata in an attempt to automatically determine whether an agency
provided the image (and if so which agency). Importantly we can use metadata to automatically determine what usage
rights should be applied to a picture. These rights allow the Grid to understand the contractual obligations of an
image, whether it is free to use, usage is under a quota system or pay per use. The rights also determine how it can be
used (perhaps an image is restricted for news reporting only).

We can also use a set of rules to correctly set the `credit` of the image based on the agency and photographer metadata
so that it can be displayed correctly when it is used. Finally, we apply a series of rules pertaining to our in house
style, such as changing the capitalisation of place names and normalising the way initials are displayed (the Guardian
stipulates that they shouldn't have full stops).

## What is an `ImageProcessor` pipeline?

A pipeline consists of a sequence of `ImageProcessor`s applied to an image. An `ImageProcessor` is an implementation of
a Scala trait which, most importantly, has a function of `Image => Image`. `Image` is the main representation of a
picture in the Grid and an `ImageProcessor` allows you to modify any part of it, although it is strongly recommended
that only the contents of the `metadata` and `usageRights` fields are actually modified.

The `ImageProcessor`s are executed in the order they are listed in the configuration. The output of the first processor
is used as input to the second processor and so on. Each `Image` is immutable so your function will return a modified
copy which is passed as input to the next processor.

### Image processor `description`

The `ImageProcessor` trait also has a `description` field. This is a String which should be used to describe what the
image processor does. This should include any use configuration of the processor. For example if a processor uses an
external data source such as a file from an S3 bucket then it should say in the description where it comes from.

The order and description of each image processor is logged during startup to provide a record of how the Grid is
configured. This can be useful for confirming that your configuration is right and for debugging when things are not
working as expected.

## What other components are there?

There are a few helper traits which can be useful for building more complex image processors.

### Metadata cleaner

If you only want to modify `metadata` then you can instead implement `MetadataCleaner` which has a function of
`ImageMetadata => ImageMetadata`. This is a lightweight wrapper to avoid boilerplate.

### Composing image processors

If you'd like to compose your image processors in code rather than configuring them all individually at runtime (which
benefits from better compile time safety) then you might be interested in the `ComposedImageProcessor` trait which
includes a field allowing access to the underlying processors.

There is also a convenience method `ImageProcessor.compose` or you can extend `ComposeImageProcessors` which can be
useful if you want to create a companion object. There are examples these approaches being used in the codebase.

## Recommendations

We would strongly recommend that you put classification processors ahead of cleaning processors. This is because the way
in which you classify images might be broken by later changes to your cleaning processors if the cleaning is done ahead
of classification. If you classify first then this will not be impacted by cleaning processors run later in the
pipeline.
