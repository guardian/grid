import sbt._
import sbt.Keys._
import play.Play.autoImport._
import plugins.PlayArtifact._
import sbtassembly.Plugin.{AssemblyKeys, MergeStrategy}
import AssemblyKeys._
import Dependencies._


object Build extends Build {

  val commonSettings =
    Seq(
      scalaVersion := "2.10.4",
      scalaVersion in ThisBuild := "2.10.4",
      organization := "com.gu",
      version      := "0.1",
      resolvers ++= Seq(
        "Typesafe Repository" at "http://repo.typesafe.com/typesafe/releases/",
        "scalaz-stream" at "http://dl.bintray.com/pchiusano/maven"),
      scalacOptions ++= Seq("-feature", "-deprecation", "-language:higherKinds", "-Xfatal-warnings")
    ) ++
    net.virtualvoid.sbt.graph.Plugin.graphSettings

  val lib = project("common-lib")
    .libraryDependencies(awsDeps ++ elasticsearchDeps ++ playDeps ++ playWsDeps ++ scalazDeps ++ commonsIODeps ++ akkaAgentDeps ++ pandaDeps)
    .testDependencies(scalaCheckDeps)

  val thrall = playProject("thrall")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps ++ elasticSearchClientDeps)

  val kahuna = playProject("kahuna")
    .libraryDependencies(playWsDeps)
    .settings(includeAssetsSettings: _*)

  val mediaApi = playProject("media-api")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps)

  val cropService = playProject("cropper")
    .libraryDependencies(awsDeps ++ imagingDeps ++ playWsDeps)

  val editorService = playProject("metadata-editor")
    .libraryDependencies(awsDeps ++ playWsDeps)

  val imageLoader = playProject("image-loader")
    .libraryDependencies(awsDeps ++ imagingDeps)
    .testDependencies(scalaTestDeps)

  val ftpWatcher = playProject("ftp-watcher")
    .libraryDependencies(commonsNetDeps ++ scalazDeps)
    .settings(
      magentaPackageName := "ftp-watcher",
      jarName in assembly := "ftp-watcher.jar"
    )

  val integration = project("integration")
    .dependsOn(lib)
    .libraryDependencies(awsDeps ++ scalazDeps ++ uriTemplateDeps ++ playWsDeps)
    .testDependencies(scalaTestDeps ++ playDeps)
    .settings(parallelExecution in Test := false)

  val scripts = project("scripts")
    .dependsOn(lib)
    .settings(sbtassembly.Plugin.assemblySettings: _*)
    .libraryDependencies(awsDeps ++ commonsNetDeps)

  val picdarExport = project("picdar-export")
    .settings(sbtassembly.Plugin.assemblySettings: _*)
    .settings(assemblyMergeSettings: _*)
    .libraryDependencies(playDeps ++ playWsDeps)

  @deprecated
  val devImageLoader = project("dev-image-loader")
    .libraryDependencies(playDeps ++ playWsDeps)


  def project(path: String): Project =
    Project(path, file(path)).settings(commonSettings: _*)

  def playProject(path: String): Project =
    Project(path, file(path))
      .enablePlugins(play.PlayScala)
      .dependsOn(lib)
      .settings(commonSettings ++ playArtifactDistSettings ++ playArtifactSettings: _*)
      .settings(libraryDependencies += filters)
      .settings(magentaPackageName := path)

  def playArtifactSettings = Seq(
    ivyXML :=
      <dependencies>
        <exclude org="commons-logging"/>
        <exclude org="org.springframework"/>
        <exclude org="org.scala-tools.sbt"/>
      </dependencies>
  ) ++ assemblyMergeSettings

  def assemblyMergeSettings = Seq(
    mergeStrategy in assembly <<= (mergeStrategy in assembly) { (old) => {
      case f if f.startsWith("org/apache/lucene/index/") => MergeStrategy.first
      case "play/core/server/ServerWithStop.class" => MergeStrategy.first
      case "play.plugins" => MergeStrategy.first
      case "ehcache.xml" => MergeStrategy.first
      case x => old(x)
    }}
  )

  // Ensure the static assets Play packages separately are included in the Assembly JAR
  def includeAssetsSettings = Seq(
    fullClasspath in assembly += Attributed.blank(PlayKeys.playPackageAssets.value)
  )
}
