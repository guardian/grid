# Crops

Grid is not an image manipulation tool; the only manipulation currently available to users is to [crop](https://en.wikipedia.org/wiki/Cropping_(image)) images. This will produce and store the cropped image into a specific S3 bucket. Multiple crops can be created for an image. Crops have all metadata stripped.

The Guardian's deployment of Grid takes the opinion that only crops may be used in content. In other words, for a user to add an image to content from the grid, that image __must__ have been cropped, even if that "crop" does not remove any edges of the image (in fact the Grid UI will highlight such a "full frame crop"). This has the benefit of requiring users to very clearly mark the intention to use an image in content, which should help to prevent accidental deletion of images from the Grid (although this should usually be handled by the [usages system](./usages.md)). This requirement also forms an integral part of the [cost system](./crops.md).

Crops have identifiers in the format `{x}_{y}_{w}_{h}` , where `x` and `y` are the co-ordinates for the top-left corner of the crop, and `w` and `h` are the width and height of the crop.

> **Note**
> An improvement currently under discussion would optionally add a "focal point" to a crop, which would provide some hints of the most important part of a crop to platforms displaying it, in the case they cannot display a crop at its given aspect ratio and need to trim further. Such crops may add a suffix to the id, in the format `_{fx}_{fy}`, where `fx` and `fy` are the coordinates of this focal point.
