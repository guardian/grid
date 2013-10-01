import sbt._
import sbt.Keys

object Dependencies {

  val playVersion = "2.2.0" // also exists in plugins.sbt, TODO deduplicate this

  val playDeps = Seq("com.typesafe.play" %% "play" % playVersion)

  val elasticsearchVersion = "0.90.3"

  val elasticsearchDeps = Seq("org.elasticsearch" % "elasticsearch" % elasticsearchVersion)

  val awsDeps = Seq("com.amazonaws" % "aws-java-sdk" % "1.5.7")

  val scalazDeps = Seq("org.scalaz" %% "scalaz-core" % "7.1.0-M3")

  val imagingDeps = Seq("com.drewnoakes" % "metadata-extractor" % "2.6.2")

  implicit class DependencySyntax(self: Project) {
    def libraryDependencies(dependencies: Seq[ModuleID]): Project =
      self.settings(Keys.libraryDependencies ++= dependencies)
  }

}
