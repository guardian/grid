# TIFF files

Tiff files have special handling for importing.

Like all files, we upload the original, but create an (optional) optimised
PNG, and (mandatory) thumbnail JPEG version for use in the UI.

For TIFF files, these pngs derive from the first image file extracted by
ImageMagick.  The `convert` function will extract a file of the
specified type (PNG in our case), which, in a file named `xxx.tif` will be
`xxx.png`.

However, there is additional complexity with tiff files which contain layered
content.  Specifically, the layer files will explode as `xxx-n.jpg` or
`xxx-n.png` where `n` is a numeric index.

Our code looks for this special case (see `ImageOperations.checkForOutputFileChange`)
and simply moves the `-n` layer file to the expected location.

