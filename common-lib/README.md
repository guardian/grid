# common-lib

Not an app, but a shared library, containing code which is likely to
be common across all projects, such as the data model.

This project is intended to be relatively lightweight, and as such
does not depend directly on Play, for example.

## Image operations tests

The libvips tests require its native shared library (`sudo apt-get install
libvips-dev` on Ubuntu). CI installs this dependency.

Run from the repository root, where the tests can use the existing profiles in
`cropper/`:

```sh
sbt 'common-lib/testOnly com.gu.mediaservice.lib.imaging.VipsImageOperationsTest'
```
