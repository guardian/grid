import sbt._
import sbt.Keys._
import plugins.PlayArtifact._
import sbtassembly.Plugin.AssemblyKeys._
import sbtassembly.Plugin.MergeStrategy


object Build extends Build {

  val playVersion = "2.1.3" // also exists in plugins.sbt, TODO deduplicate this
  val elasticsearchVersion = "0.90.3"

  val commonSettings = Seq(
    scalaVersion := "2.10.2",
    organization := "com.gu",
    version      := "0.1"
  )

  val playDeps = Seq("play" %% "play" % playVersion)

  val elasticsearchDeps = Seq("org.elasticsearch" % "elasticsearch" % elasticsearchVersion)

  lazy val root = sbt.Project("root", file("."))
    .settings(commonSettings: _*)
    .aggregate(mediaApi, devImageLoader)

  val mediaApi = play.Project("media-api", path = file("media-api"))
    .settings(commonSettings: _*)
    .settings(playArtifactDistSettings: _*)
    .settings(
      magentaPackageName := "media-api",
      ivyXML :=
        <dependencies>
          <exclude org="commons-logging"/>
          <exclude org="org.springframework"/>
          <exclude org="org.scala-tools.sbt"/>
          <exclude name="scala-stm_2.10.0"/>
        </dependencies>,
      mergeStrategy in assembly <<= (mergeStrategy in assembly) { (old) => {
        case f if f.startsWith("org/apache/lucene/index/") => MergeStrategy.first
        case "play/core/server/ServerWithStop.class" => MergeStrategy.first
        case "ehcache.xml" => MergeStrategy.first
        case x => old(x)
      }}
    )
    .settings(libraryDependencies ++= elasticsearchDeps)
    .settings(libraryDependencies ++= Seq(
      "com.drewnoakes" % "metadata-extractor" % "2.6.2"
    ))

  val devImageLoader = sbt.Project("dev-image-loader", file("dev-image-loader"))
    .settings(commonSettings: _*)
    .settings(libraryDependencies ++= playDeps)

}
