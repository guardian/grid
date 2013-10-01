import sbt._
import sbt.Keys._
import plugins.PlayArtifact._
import sbtassembly.Plugin.{AssemblyKeys, MergeStrategy}
import AssemblyKeys._
import Dependencies._


object Build extends Build {

  val commonSettings = Seq(
    scalaVersion in ThisBuild := "2.10.2",
    organization := "com.gu",
    version      := "0.1"
  )

  val playArtifactSettings = Seq(
    // package config for Magenta and Upstart
    playArtifactResources <<= (baseDirectory, name, playArtifactResources) map {
      (base, name, defaults) => defaults ++ Seq(
        base / "conf" / "deploy.json" -> "deploy.json",
        base / "conf" / (name + ".conf") -> ("packages/media-service-" + name + "/" + name + ".conf")
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

  val lib = sbt.Project("common-lib", file("common-lib"))
    .settings(commonSettings: _*)
    .settings(libraryDependencies ++= awsDeps ++ elasticsearchDeps ++ playDeps ++ scalazDeps)

  val thrall = play.Project("thrall", path = file("thrall"))
    .dependsOn(lib)
    .settings(commonSettings: _*)
    .settings(playArtifactDistSettings ++ playArtifactSettings: _*)
    .settings(magentaPackageName := "media-service-thrall")
    .settings(libraryDependencies ++= elasticsearchDeps ++ awsDeps)
    .settings(libraryDependencies ++= scalazDeps)

  val mediaApi = play.Project("media-api", path = file("media-api"))
    .dependsOn(lib)
    .settings(commonSettings: _*)
    .settings(playArtifactDistSettings ++ playArtifactSettings: _*)
    .settings(magentaPackageName := "media-service-media-api")
    .settings(libraryDependencies ++=
      elasticsearchDeps ++
      awsDeps ++
      scalazDeps ++
      imagingDeps
    )
    .settings(net.virtualvoid.sbt.graph.Plugin.graphSettings: _*)

  val imageLoader = play.Project("image-loader", path = file("image-loader"))
    .dependsOn(lib)
    .settings(commonSettings: _*)
    .settings(playArtifactDistSettings ++ playArtifactSettings: _*)
    .settings(magentaPackageName := "media-service-image-loader")
    .settings(libraryDependencies ++= awsDeps ++ imagingDeps)

  @deprecated
  val devImageLoader = sbt.Project("dev-image-loader", file("dev-image-loader"))
    .settings(commonSettings: _*)
    .settings(libraryDependencies ++= playDeps)

}
