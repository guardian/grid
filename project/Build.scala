import sbt._
import sbt.Keys._
import play.Project._

object Build extends Build {

  val playVersion = "2.1.3" // also exists in plugins.sbt, TODO deduplicate this
  val elasticsearchVersion = "0.90.3"

  val commonSettings = Seq(
    scalaVersion := "2.10.2",
    organization := "com.gu"
  )

  val playDeps = Seq("play" %% "play" % playVersion)

  val elasticsearchDeps = Seq("org.elasticsearch" % "elasticsearch" % elasticsearchVersion)

  lazy val root = sbt.Project("root", file("."))
    .settings(commonSettings: _*)
    .aggregate(mediaApi)

  val mediaApi = play.Project("media-api", path = file("media-api"))
    .settings(commonSettings: _*)
    .settings(libraryDependencies ++= elasticsearchDeps)
    .settings(libraryDependencies ++= Seq(
      "org.typelevel" %% "scalaz-contrib-210" % "0.1.5"
    ))

  val devImageLoader = sbt.Project("dev-image-loader", file("dev-image-loader"))
    .settings(commonSettings: _*)
    .settings(libraryDependencies ++= playDeps)

}
