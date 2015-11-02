import sbt._
import sbt.Keys

object Dependencies {

  val playVersion = "2.3.8" // also exists in plugins.sbt, TODO deduplicate this

  val playDeps = Seq(
    ("com.typesafe.play" %% "play" % playVersion)
      // Avoid assembly conflicts with com.google.gdata:core required by panda
      exclude ("oauth.signpost", "signpost-core")
      exclude ("oauth.signpost", "signpost-commonshttp4")
  )

  val playWsDeps = Seq(
    ("com.typesafe.play" %% "play-ws" % playVersion)
      // Avoid assembly conflicts with com.google.gdata:core required by panda
      exclude ("oauth.signpost", "signpost-core")
      exclude ("oauth.signpost", "signpost-commonshttp4")
  )

  val elasticsearchVersion = "1.3.4"

  val elasticsearchDeps = Seq("org.elasticsearch" % "elasticsearch" % elasticsearchVersion)

  val awsDeps = Seq(
    ("com.amazonaws" % "aws-java-sdk" % "1.9.34")
  )

  val pandaDeps = Seq(
    ("com.gu" %% "pan-domain-auth-core" % "0.2.7") exclude ("xpp3", "xpp3") exclude("com.google.guava", "guava-jdk5"),
    ("com.gu" %% "pan-domain-auth-play" % "0.2.7")
  )

  val guDeps = Seq(
    "com.gu" %% "content-api-client" % "7.1"
  )

  val reactiveXDeps = Seq(
    "io.reactivex" %% "rxscala" % "0.25.0"
  )

  val scalazDeps = Seq(
    "org.scalaz.stream" %% "scalaz-stream" % "0.6"
  )

  val imagingDeps = Seq(
    "com.drewnoakes" % "metadata-extractor" % "2.8.1",
    "org.im4java" % "im4java" % "1.4.0"
  )

  val parsingDeps = Seq(
    "org.parboiled" %% "parboiled" % "2.1.0"
  )

  val loggingDeps = Seq(
    "com.gu" % "kinesis-logback-appender" % "1.0.5",
    "net.logstash.logback" % "logstash-logback-encoder" % "4.4"
  )

  val commonsNetDeps = Seq(
    "commons-net" % "commons-net" % "3.3",
    "org.apache.httpcomponents" % "httpclient" % "4.3.1"
  )

  val commonsIODeps = Seq("commons-io" % "commons-io" % "2.4")

  val akkaAgentDeps = Seq("com.typesafe.akka" %% "akka-agent" % "2.3.9")

  val scalaTestDeps = Seq("org.scalatest" %% "scalatest" % "2.2.4")

  val scalaCheckDeps = Seq("org.scalacheck" %% "scalacheck" % "1.12.1")

  val uriTemplateDeps = Seq("no.arktekk" %% "uri-template" % "1.0.2")

  // The `updatebyquery` plugin is potentially a polyfill as it looks like there is the intention of adding this
  // See: https://github.com/yakaz/elasticsearch-action-updatebyquery
  val elasticSearchClientDeps = Seq(
    "org.codehaus.groovy" % "groovy-json" % "2.3.7",
    "com.yakaz.elasticsearch.plugins" % "elasticsearch-action-updatebyquery" % "2.2.0"
  )

  val legacyBlockingHttp = Seq("org.scalaj" %% "scalaj-http" % "1.1.4")

  implicit class DependencySyntax(self: Project) {

    def libraryDependencies(dependencies: Seq[ModuleID]): Project =
      self.settings(Keys.libraryDependencies ++= dependencies)

    def testDependencies(dependencies: Seq[ModuleID]): Project =
      self.settings(Keys.libraryDependencies ++= dependencies map (_.copy(configurations = Some("test"))))
  }

}
