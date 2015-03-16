# Img Opts for the Grid
Local version of the imgopts service that run

## Requirements
You can run [`./dev-install`](./dev-install) or complete the steps manually:

* [GD](http://libgd.github.io/)
** Linux: `sudo apt-get install gd`
** Mac:  `brew install gd`
* Removal of any nginx
** Linux: `sudo apt-get remove nginx*`
** Mac: `brew remove nginx`

## Notes

* This will blat your last nginx config, so you will have to run
[dev-nginx](https://github.com/guardian/dev-nginx) again.
