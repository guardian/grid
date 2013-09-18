import sbt._
import sbt.Keys._
import plugins.PlayArtifact._
import sbtassembly.Plugin.{AssemblyKeys, MergeStrategy}
import AssemblyKeys._


object Build extends Build {

  val playVersion = "2.1.3" // also exists in plugins.sbt, TODO deduplicate this
  val elasticsearchVersion = "0.90.3"

  val commonSettings = Seq(
    scalaVersion in ThisBuild := "2.10.2",
    organization := "com.gu",
    version      := "0.1"
  )

  val playDeps = Seq("play" %% "play" % playVersion)

  val elasticsearchDeps = Seq("org.elasticsearch" % "elasticsearch" % elasticsearchVersion)

  val awsDeps = Seq("com.amazonaws" % "aws-java-sdk" % "1.5.7")

  lazy val root = sbt.Project("root", file("."))
    .settings(commonSettings: _*)
    .aggregate(mediaApi, devImageLoader, thrall)

  val thrall = play.Project("thrall", path = file("thrall"))
    .settings(commonSettings: _*)
    .settings(playArtifactDistSettings: _*)
    .settings(
      magentaPackageName := "media-service-thrall",

      // package config for Magenta and Upstart
      playArtifactResources <<= (baseDirectory, playArtifactResources) map {
        (base, defaults) => defaults ++ Seq(
          base / "conf" / "deploy.json" -> "deploy.json",
          base / "conf" / "media-api.conf" -> "packages/media-service-thrall/thrall.conf"
        )
      },
      ivyXML :=
        <dependencies>
          <exclude org="commons-logging"/>
          <exclude org="org.springframework"/>
          <exclude org="org.scala-tools.sbt"/>
        </dependencies>,
      mergeStrategy in assembly <<= (mergeStrategy in assembly) { (old) => {
        case f if f.startsWith("org/apache/lucene/index/") => MergeStrategy.first
        case "play/core/server/ServerWithStop.class" => MergeStrategy.first
        case "ehcache.xml" => MergeStrategy.first
        case x => old(x)
      }}
    )
    .settings(libraryDependencies ++= elasticsearchDeps ++ awsDeps)

  val mediaApi = play.Project("media-api", path = file("media-api"))
    .settings(commonSettings: _*)
    .settings(playArtifactDistSettings: _*)
    .settings(
      magentaPackageName := "media-service-media-api",

      // package config for Magenta and Upstart
      playArtifactResources <<= (baseDirectory, playArtifactResources) map {
        (base, defaults) => defaults ++ Seq(
          base / "conf" / "deploy.json" -> "deploy.json",
          base / "conf" / "media-api.conf" -> "packages/media-service-media-api/media-api.conf"
        )
      },
      ivyXML :=
        <dependencies>
          <exclude org="commons-logging"/>
          <exclude org="org.springframework"/>
          <exclude org="org.scala-tools.sbt"/>
        </dependencies>,
      mergeStrategy in assembly <<= (mergeStrategy in assembly) { (old) => {
        case f if f.startsWith("org/apache/lucene/index/") => MergeStrategy.first
        case "play/core/server/ServerWithStop.class" => MergeStrategy.first
        case "ehcache.xml" => MergeStrategy.first
        case x => old(x)
      }}
    )
    .settings(libraryDependencies ++=
      elasticsearchDeps ++
      awsDeps ++
      Seq("com.drewnoakes" % "metadata-extractor" % "2.6.2")
    )
    .settings(net.virtualvoid.sbt.graph.Plugin.graphSettings: _*)

  val devImageLoader = sbt.Project("dev-image-loader", file("dev-image-loader"))
    .settings(commonSettings: _*)
    .settings(libraryDependencies ++= playDeps)

}
