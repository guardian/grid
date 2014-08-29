import sbt._
import sbt.Keys

object Dependencies {

  val playVersion = "2.3.3" // also exists in plugins.sbt, TODO deduplicate this

  val playDeps = Seq("com.typesafe.play" %% "play" % playVersion)

  val playWsDeps = Seq("com.typesafe.play" %% "play-ws" % playVersion)

  val elasticsearchVersion = "1.3.2"

  val elasticsearchDeps = Seq("org.elasticsearch" % "elasticsearch" % elasticsearchVersion)

  val awsDeps = Seq("com.amazonaws" % "aws-java-sdk" % "1.7.5")

  val scalazDeps = Seq(
    "org.scalaz.stream" %% "scalaz-stream" % "0.3.1"
  )

  val imagingDeps = Seq(
    "com.drewnoakes" % "metadata-extractor" % "2.6.2",
    "org.im4java" % "im4java" % "1.4.0"
  )

  val commonsNetDeps = Seq(
    "commons-net" % "commons-net" % "3.3",
    "org.apache.httpcomponents" % "httpclient" % "4.3.1"
  )

  val commonsIODeps = Seq("commons-io" % "commons-io" % "2.4")

  val akkaAgentDeps = Seq("com.typesafe.akka" %% "akka-agent" % "2.3.4")

  val scalaTestDeps = Seq("org.scalatest" %% "scalatest" % "2.0.RC1")

  val scalaCheckDeps = Seq("org.scalacheck" %% "scalacheck" % "1.11.3")

  val uriTemplateDeps = Seq("no.arktekk" %% "uri-template" % "1.0.1")


  implicit class DependencySyntax(self: Project) {

    def libraryDependencies(dependencies: Seq[ModuleID]): Project =
      self.settings(Keys.libraryDependencies ++= dependencies)

    def testDependencies(dependencies: Seq[ModuleID]): Project =
      self.settings(Keys.libraryDependencies ++= dependencies map (_.copy(configurations = Some("test"))))
  }

}
