import com.twitter.scrooge.ScroogeSBT
import sbt._
import sbt.Keys._
import play.Play.autoImport._
import com.typesafe.sbt.SbtNativePackager.autoImport._
import com.typesafe.sbt.packager.universal.UniversalPlugin
import com.typesafe.sbt.packager.universal.UniversalPlugin.autoImport._
import plugins.PlayArtifact._
import plugins.LegacyAssemblyPlayArtifact._
import com.gu.riffraff.artifact.RiffRaffArtifact.autoImport._
import com.gu.riffraff.artifact.RiffRaffArtifact
import Dependencies._

// Note: assembly now just used for helper and legacy apps
import sbtassembly.Plugin.{AssemblyKeys, MergeStrategy}
import AssemblyKeys._




object Build extends Build {


  def getEnv(key: String): Option[String] = Option(System.getenv(key))
  def getProp(key:String): Option[String] = Option(System.getProperty(key))

  def env(key: String): Option[String] = (getEnv(key) ++ getProp(key)).headOption


  val riffRaffSettings =
    Seq(
      riffRaffPackageType := (packageZipTarball in Universal).value,
      riffRaffBuildIdentifier := env("BUILD_NUMBER").getOrElse("DEV"),
      riffRaffManifestProjectName := s"media-service::jenkins::${name.value}",
      riffRaffArtifactResources := (Seq(
        // systemd config file
        baseDirectory.value / "conf" / (magentaPackageName.value + ".service") ->
        (s"packages/${magentaPackageName.value}/${magentaPackageName.value}.service"),


        // upstart config file
        baseDirectory.value / "conf" / (magentaPackageName.value + ".conf") ->
        (s"packages/${magentaPackageName.value}/${magentaPackageName.value}.conf"),

        baseDirectory.value / "conf" / "start.sh" -> s"packages/${magentaPackageName.value}/start.sh",

        // the ZIP
        dist.value -> s"packages/${magentaPackageName.value}/app.zip",

        // and the riff raff deploy instructions
        baseDirectory.value / "conf" / "deploy.json" -> "deploy.json"
        ) ++ (name.value match {
          case "cropper" | "image-loader" =>
            Seq("cmyk.icc", "grayscale.icc", "srgb.icc", "facebook-TINYsRGB_c2.icc").map { file =>
              baseDirectory.value / file -> s"packages/${magentaPackageName.value}/$file"
            }
          case _ => Seq()
        })
      ),
      riffRaffPackageName := riffRaffPackageName.value,
      riffRaffUploadArtifactBucket := Option("riffraff-artifact"),
      riffRaffUploadManifestBucket := Option("riffraff-builds")
    ) ++ env("GIT_BRANCH").map(branch => Seq(riffRaffManifestBranch := branch)).getOrElse(Nil)

  val commonSettings =
    Seq(
      scalaVersion := "2.11.6",
      scalaVersion in ThisBuild := "2.11.6",
      organization := "com.gu",
      fork in run  := true,
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
      pandaDeps ++ imagingDeps ++ commonsNetDeps)
    .testDependencies(scalaCheckDeps ++ scalaTestDeps)

  val thrall = playProject("thrall")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++ scalazDeps ++ elasticSearchClientDeps)

  import com.typesafe.sbt.web.SbtWeb
  import com.typesafe.sbt.web.Import._
  import com.typesafe.sbt.digest.Import._

  val kahuna = playProject("kahuna")
    .libraryDependencies(playWsDeps)
    .enablePlugins(SbtWeb)
    .settings(pipelineStages := Seq(digest))

  val auth = playProject("auth")
    .libraryDependencies(playWsDeps)

  val mediaApi = playProject("media-api")
    .libraryDependencies(elasticsearchDeps ++ awsDeps ++
      scalazDeps ++ parsingDeps ++ uriTemplateDeps)
    .testDependencies(scalaTestDeps)

  val cropService = playProject("cropper")
    .libraryDependencies(awsDeps ++ imagingDeps ++ playWsDeps)
    .testDependencies(scalaTestDeps)

  val editorService = playProject("metadata-editor")
    .libraryDependencies(awsDeps ++ playWsDeps)
    .testDependencies(scalaTestDeps)

  import ScroogeSBT.autoImport._
  import ScroogeSBT._

  val usageService = {


    playProject("usage")
      // See: https://github.com/sbt/sbt-buildinfo/issues/88#issuecomment-216541181
      .settings(scroogeThriftOutputFolder in Compile := sourceManaged.value / "thrift")
      .settings(scroogeThriftDependencies in Compile := Seq("content-api-models", "story-packages-model-thrift",
        "content-atom-model-thrift"))
      .libraryDependencies(awsDeps ++ playWsDeps ++ reactiveXDeps ++ usageGuDeps ++ kinesisDeps)
      // See: https://github.com/twitter/scrooge/issues/199
      .settings( scroogeThriftSources in Compile ++= {
      (scroogeUnpackDeps in Compile).value.flatMap { dir => (dir ** "*.thrift").get }
    })
  }


  val imageLoader = playProject("image-loader")
    .libraryDependencies(awsDeps ++ imagingDeps)
    .testDependencies(scalaTestDeps)

  val collections = playProject("collections")
    .libraryDependencies(awsDeps)
    .testDependencies(scalaTestDeps)

  val leases = playProject("leases")
    .libraryDependencies(awsDeps ++ scanamoDeps)
    .testDependencies(scalaTestDeps)


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
    .settings(fiddlyExtraAssemblySettings: _*)

  def fiddlyExtraAssemblySettings = Seq(
    mergeStrategy in assembly <<= (mergeStrategy in assembly) { (old) => {
      case "version.txt" => MergeStrategy.first
      case "play.plugins" => MergeStrategy.first
      case "logger.xml" => MergeStrategy.first
      case "logback.xml" => MergeStrategy.first
      case "play/core/server/ServerWithStop.class" => MergeStrategy.first
      case x => old(x)
    }}
  )


  def project(path: String): Project =
    Project(path, file(path)).settings(commonSettings: _*)

  def playProject(path: String): Project =
    Project(path, file(path))
      // See: https://github.com/sbt/sbt-buildinfo/issues/88#issuecomment-216541181
      .settings(scroogeThriftOutputFolder in Compile := sourceManaged.value / "thrift")
      .enablePlugins(play.PlayScala)
      .enablePlugins(RiffRaffArtifact, UniversalPlugin)
      .dependsOn(lib)
      .settings(commonSettings ++ riffRaffSettings ++ playArtifactDistSettings ++ playArtifactSettings: _*)
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
