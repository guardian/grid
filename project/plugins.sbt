resolvers += Resolver.url("Play", url("http://download.playframework.org/ivy-releases/"))(Resolver.ivyStylePatterns)

addSbtPlugin("play" % "sbt-plugin" % "2.1.3")

addSbtPlugin("com.gu" % "sbt-teamcity-test-reporting-plugin" % "1.3")
