# CI

We use Teamcity for continuous integration.

There is a separate build per Grid app.

Builds are triggered conditionally based on what files have changed. That is, 
if we change a file in `kahuna` we will only build that project as there's no 
need to build `auth` too, for example.

Teamcity will shell out to a script in this directory depending on which app is 
being built.

Deploys are performed with Riff Raff. Look for projects prefixed with `media-service::grid::`. 

Continuous deployment is **on** for `master` in `TEST`.
