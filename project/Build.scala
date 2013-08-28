import sbt._
import sbt.Keys._
import play.Project._

object Build extends Build {

  val commonSettings = Seq(
    scalaVersion := "2.10.2"
  )

  lazy val root = sbt.Project("root", file("."))
    .settings(commonSettings: _*)
    .aggregate(mediaApi)

  val mediaApi = play.Project("media-api", path = file("media-api"))
    .settings(commonSettings: _*)

  val devImageLoader = sbt.Project("dev-image-loader", file("dev-image-loader"))
    .settings(commonSettings: _*)


}
