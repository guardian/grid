import sbt._
import sbt.Keys._
import plugins.PlayArtifact._
import sbtassembly.Plugin.{AssemblyKeys, MergeStrategy}
import AssemblyKeys._
import Dependencies._


object Build extends Build {

  val commonSettings =
    Seq(
      scalaVersion in ThisBuild := "2.10.2",
      organization := "com.gu",
      version      := "0.1",
      resolvers += "Typesafe Repository" at "http://repo.typesafe.com/typesafe/releases/",
      scalacOptions ++= Seq("-feature", "-deprecation")
    ) ++
    net.virtualvoid.sbt.graph.Plugin.graphSettings

  val lib = project("common-lib")
    .libraryDependencies(awsDeps ++ elasticsearchDeps ++ playDeps ++ scalazDeps)

  val thrall = playProject("thrall")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps)

  val mediaApi = playProject("media-api")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps ++ imagingDeps)

  val imageLoader = playProject("image-loader")
    .libraryDependencies(awsDeps ++ imagingDeps)

  @deprecated
  val devImageLoader = project("dev-image-loader")
    .libraryDependencies(playDeps)


  def project(path: String): Project =
    Project(path, file(path)).settings(commonSettings: _*)

  def playProject(path: String): Project =
    play.Project(path, path = file(path))
      .dependsOn(lib)
      .settings(commonSettings ++ playArtifactDistSettings ++ playArtifactSettings: _*)
      .settings(magentaPackageName := "media-service-" + path)

  def playArtifactSettings = Seq(
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

}
