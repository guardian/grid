Usage rights provider
=====================

When applying usage rights to an image a user might be required to specify additional information like photographers,
illustrators and creative commons licenses. This additional data can be retrieved from various
sources depending on the adopter e.g. from code, from a config file, from a database. The ability to have different
sources defined depending on the installation is made possible by the use of a provider.

Overview
--------

The `UsageRightsConfigProvider` - is a class that provides usage rights configuration. The following provider
implementations are provided out of the box in the Grid.

* `GuardianUsageRightsConfig` - which has hardcoded configuration in code. The configuration looks similar as shown
  below.

```hocon
usageRightsConfigProvider = "com.gu.mediaservice.lib.guardian.GuardianUsageRightsConfig"
```

* `RuntimeUsageRightsConfig` - that fetches the data from the application configuration. To use this provider and
  define the configuration from application configuration files see sample below:

```hocon
usageRightsConfigProvider {
  className: "com.gu.mediaservice.lib.config.RuntimeUsageRightsConfig"
  config {
    externalStaffPhotographers = [ # list of external staff photographers grouped by publication
      {
        name = "Publication 1",
        photographers = ["John Doe"]
      }
      {
        name = "Publication 3",
        photographers = ["Hafeez Jackson"]
      }
    ]
    internalStaffPhotographers = [ # list of internal staff photographers grouped by publication
      {
        name = "Publication 1",
        photographers = ["Jane Doe"]
      }
    ]
    contractedPhotographers = [ # list of contracted photographers grouped by publication
      {
        name = "Contract Photographers 1",
        photographers = ["Peter Larry"]
      }
    ]
    contractIllustrators = [ # list of contracted illustrators grouped by publication
      {
        name = "Contract Illustrators 1",
        photographers = ["Tom Hardy"]
      }
    ]
    staffIllustrators = ["John Doe", "Jane Doe", "Larry Wolf"] # list of staff illustrators
    creativeCommonsLicense = [ # list of allowed creative commons licenses
      "CC BY-4.0",
      "CC BY-SA-4.0",
      "CC BY-ND-4.0"
    ]
  }
}
```

Further providers could be created to by implementing a `UsageRightsConfigProvider` trait and have the following values
`externalStaffPhotographers`, `internalStaffPhotographers`, `contractedPhotographers`, `contractIllustrators`,
`staffIllustrators` and `creativeCommonsLicense` defined by data from a source for example, a database.
