import sbt._
import sbt.Keys

object Dependencies {

  val playVersion = "2.2.1" // also exists in plugins.sbt, TODO deduplicate this

  val playDeps = Seq("com.typesafe.play" %% "play" % playVersion)

  val elasticsearchVersion = "0.90.5"

  val elasticsearchDeps = Seq("org.elasticsearch" % "elasticsearch" % elasticsearchVersion)

  val awsDeps = Seq("com.amazonaws" % "aws-java-sdk" % "1.5.7")

  val scalazDeps = Seq(
    "org.scalaz.stream" %% "scalaz-stream" % "0.2a"
  )

  val imagingDeps = Seq(
    "com.drewnoakes" % "metadata-extractor" % "2.6.2",
    "org.im4java" % "im4java" % "1.4.0"
  )

  val commonsNetDeps = Seq(
    "commons-net" % "commons-net" % "3.3",
    "org.apache.httpcomponents" % "httpclient" % "4.3.1"
  )

  val scalaTestDeps = Seq("org.scalatest" %% "scalatest" % "2.0.RC1")

  implicit class DependencySyntax(self: Project) {

    def libraryDependencies(dependencies: Seq[ModuleID]): Project =
      self.settings(Keys.libraryDependencies ++= dependencies)

    def testDependencies(dependencies: Seq[ModuleID]): Project =
      self.settings(Keys.libraryDependencies ++= dependencies map (_.copy(configurations = Some("test"))))
  }

}
