resolvers ++= Seq(
    DefaultMavenRepository,
    Resolver.url("Play", url("http://download.playframework.org/ivy-releases/"))(Resolver.ivyStylePatterns),
    "Typesafe Repository" at "http://repo.typesafe.com/typesafe/releases/",
    Resolver.url("sbt-plugin-releases",url("http://scalasbt.artifactoryonline.com/scalasbt/sbt-plugin-releases/"))(Resolver.ivyStylePatterns)
)

addSbtPlugin("play" % "sbt-plugin" % "2.1.3")

addSbtPlugin("com.gu" % "sbt-teamcity-test-reporting-plugin" % "1.3")
