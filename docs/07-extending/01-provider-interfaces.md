Extending the Grid using providers
==================================

The Grid can be customised to suit your organisation. In particular, alternative "providers" for the image ingest
pipelines, usage rights and authentication can be loaded dynamically at start time.

We aim to allow modifications to your installation of the Grid without having to alter the source code of the Grid
itself over and above what might be possible with configuration changes.

The two areas that are most commonly desired to be customised are image ingest processors (how metadata is extracted
from images and how metadata is modified or cleaned) and authentication/authorisation (how does the Grid identify a user
and what actions a user is allowed to take).

The general process for creating a custom provider is to:

* write an implementation of a provider interface
* configure the Grid to use your provider implementation

When you implement a provider interface you should ensure that your provider is compiled against the same version of the
Grid as you intend to run. We will avoid making breaking changes to these interfaces unless absolutely necessary but
bear in mind that we might need to do so.

All provider interfaces use a common configuration loading mechanism. This can load companion objects, classes with
no-arg constructors and classes with constructors that take one or two standard provider parameters.

A configuration for a provider can be in one of two formats depending on whether the configuration contains provider
specific configuration.

If a provider doesn't need any custom configuration then you can provide just the object or class name:

```hocon
authentication.providers.user = "com.example.auth.MyUserProvider"
```

If a provider does need custom configuration then you specify an object with `className` and `config` fields:

```hocon
authentication.providers.user {
  className = "com.example.auth.MyConfigurableUserProvider"
  config {
    systemName = "my-system-name"
    allowList = "s3://my-bucket/my-allow-list.json"
  }
}
```

As mentioned earlier, there are standard provider parameter types for the provider class constructors:

* `play.api.Configuration` - this argument will contain the configuration in the `config` field of your provider
* the provider specific resources class - this is defined by your resource type and typically provides access to AWS
  credentials, an execution context and a web client for making external calls
