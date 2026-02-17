# Usages

The Grid can track where an image has been used in content. Generally, the consumer will need to call the Grid's Usages API to notify that the content has been used.

This information powers some badges on the UI (eg. adds a warning when a given image was used in the past 7 days, which helps prevent repeated usage of an image in multiple pieces of content), and an active usage will prevent an image from being deleted. Users can also follow a backreference to the location of the usage.
