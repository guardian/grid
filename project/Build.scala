import sbt._
import sbt.Keys._
import play.Play.autoImport._
import com.typesafe.sbt.SbtNativePackager.autoImport._
import plugins.PlayArtifact._
import Dependencies._

// Note: assembly now just used for helper and legacy apps
import sbtassembly.Plugin.{AssemblyKeys, MergeStrategy}
import AssemblyKeys._


object Build extends Build {

  val commonSettings =
    Seq(
      scalaVersion := "2.11.6",
      scalaVersion in ThisBuild := "2.11.6",
      organization := "com.gu",
      version      := "0.1",
      resolvers ++= Seq(
        "Typesafe Repository" at "http://repo.typesafe.com/typesafe/releases/",
        "scalaz-stream" at "http://dl.bintray.com/pchiusano/maven",
        Resolver.sonatypeRepo("releases")),
      scalacOptions ++= Seq("-feature", "-deprecation", "-language:higherKinds", "-Xfatal-warnings")
    ) ++
    net.virtualvoid.sbt.graph.Plugin.graphSettings

  val lib = project("common-lib")
    .libraryDependencies(loggingDeps ++ awsDeps ++ elasticsearchDeps ++
      playDeps ++ playWsDeps ++ scalazDeps ++ commonsIODeps ++ akkaAgentDeps ++
      pandaDeps ++ imagingDeps)
    .testDependencies(scalaCheckDeps ++ scalaTestDeps)

  val thrall = playProject("thrall")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps ++ elasticSearchClientDeps)

  val kahuna = playProject("kahuna")
    .libraryDependencies(playWsDeps)

  val mediaApi = playProject("media-api")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++
      scalazDeps ++ parsingDeps ++ uriTemplateDeps)
    .testDependencies(scalaTestDeps)

  val cropService = playProject("cropper")
    .libraryDependencies(awsDeps ++ imagingDeps ++ playWsDeps)

  val editorService = playProject("metadata-editor")
    .libraryDependencies(awsDeps ++ playWsDeps)
    .testDependencies(scalaTestDeps)

  val usageService = playProject("usage")
    .libraryDependencies(awsDeps ++ playWsDeps ++ reactiveXDeps ++ guDeps)

  val imageLoader = playProject("image-loader")
    .libraryDependencies(awsDeps ++ imagingDeps)
    .testDependencies(scalaTestDeps)

  val collections = playProject("collections")
    .libraryDependencies(awsDeps)
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
    .dependsOn(lib)
    .libraryDependencies(legacyBlockingHttp)
    .settings(sbtassembly.Plugin.assemblySettings: _*)
    .settings(playArtifactSettings: _*)
    .settings(fiddlyExtraAssemblySettingsForExport: _*)

  def fiddlyExtraAssemblySettingsForExport = Seq(
    mergeStrategy in assembly <<= (mergeStrategy in assembly) { (old) => {
      case "version.txt" => MergeStrategy.first
      case "play.plugins" => MergeStrategy.first
      case "logback.xml" => MergeStrategy.first
      case "play/core/server/ServerWithStop.class" => MergeStrategy.first
      case x => old(x)
    }}
  )


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
  )
}
