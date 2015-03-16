# Img Opts for the Grid
Local version of the imgopts service

## Requirements
* [GD](http://libgd.github.io/)
  * Linux: `sudo apt-get install libgd-dev`
  * Mac:  `brew install gd`

## Installation
``` Bash
./dev-setup.sh YOUR_IMAGE_BUCKET
./dev-start.sh
```

# Is it running
[localhost](http://localhost:9008/_) | [URL](https://media-imgopts.local.dev-***REMOVED***/_)?

## Deploy
To see any changes that you make within the configuration propagate to
PROD / TEST you will need to update the Cloudformation script that spins up these
instances. __This is for local testing only__.
