# Cheap and cheerful scripts to clean up our grid imagebuckets

## Delete function
```
delete-images-by-prefix.sh
```
Deletes images, if found, which match the provided prefix.

Takes parameters:
  * size
  * prefix
  * stage
  * profile
  * region

Not intended to be invoked directly.

## Wrapper function to delete images in the root
```
images-in-root.sh
```

Takes parameters:
  * size
  * stage
  * profile
  * region

## Wrapper function to delete images with a null first prefix (ie key beginning with /)
```
images-with-empty-prefix.sh
```

Takes parameters:
  * size
  * stage
  * profile
  * region

Continues until it successfully deletes something or runs out of prefixes to check.
