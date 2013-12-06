import sbt._
import sbt.Keys._
import plugins.PlayArtifact._
import sbtassembly.Plugin.{AssemblyKeys, MergeStrategy}
import AssemblyKeys._
import Dependencies._


object Build extends Build {

  val commonSettings =
    Seq(
      scalaVersion := "2.10.3",
      scalaVersion in ThisBuild := "2.10.3",
      organization := "com.gu",
      version      := "0.1",
      resolvers ++= Seq(
        "Typesafe Repository" at "http://repo.typesafe.com/typesafe/releases/",
        "scalaz-stream" at "http://dl.bintray.com/pchiusano/maven"),
      scalacOptions ++= Seq("-feature", "-deprecation", "-language:higherKinds", "-Xfatal-warnings")
    ) ++
    net.virtualvoid.sbt.graph.Plugin.graphSettings

  val lib = project("common-lib")
    .libraryDependencies(awsDeps ++ elasticsearchDeps ++ playDeps ++ scalazDeps ++ commonsIODeps ++ akkaAgentDeps)

  val thrall = playProject("thrall")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps)

  val kahuna = playProject("kahuna")

  val mediaApi = playProject("media-api")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps)

  val cropService = playProject("crop-service")

  val imageLoader = playProject("image-loader")
    .libraryDependencies(awsDeps ++ imagingDeps)

  val ftpWatcher = playProject("ftp-watcher")
    .libraryDependencies(commonsNetDeps ++ scalazDeps)
    .settings(
      magentaPackageName := "ftp-watcher",
      jarName in assembly := "ftp-watcher.jar",
      playArtifactResources <<= (baseDirectory, playArtifactResources)
        .map((base, resources) => (base / "truststore.ts" -> "packages/ftp-watcher/truststore.ts") +: resources)
    )

  val integration = project("integration")
    .dependsOn(lib)
    .libraryDependencies(awsDeps ++ scalazDeps)
    .testDependencies(scalaTestDeps ++ playDeps)
    .settings(parallelExecution in Test := false)

  val scripts = project("scripts")
    .settings(sbtassembly.Plugin.assemblySettings: _*)
    .libraryDependencies(awsDeps ++ commonsNetDeps)

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
