import sbt._
import sbt.Keys._
import play.Project._

object Build extends Build {

  lazy val root = sbt.Project("root", file("."))
    .settings(scalaVersion in ThisBuild := "2.10.2")
    .aggregate(mediaApi)

  val mediaApi = play.Project("media-api", path = file("media-api"))
    .settings(scalaVersion := "2.10.2")

}

