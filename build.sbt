import play.sbt.PlayImport.PlayKeys._
import sbt.Package.FixedTimestamp

import scala.sys.process._
import scala.util.control.NonFatal
import scala.collection.JavaConverters._

import com.typesafe.sbt.packager.debian.JDebPackaging

// We need to keep the timestamps to allow caching headers to work as expected on assets.
// The below should work, but some problem in one of the plugins (possible the play plugin? or sbt-web?) causes
// the option not to be passed correctly
//   ThisBuild / packageTimestamp := Package.keepTimestamps
// Setting as a packageOption seems to bypass that problem, wherever it lies
ThisBuild / packageOptions += FixedTimestamp(Package.keepTimestamps)

val commonSettings = Seq(
  scalaVersion := "2.12.15",
  description := "grid",
  organization := "com.gu",
  version := "0.1",
  scalacOptions ++= Seq("-feature", "-deprecation", "-language:higherKinds", "-Xfatal-warnings"),

  // The Java SDK uses CBOR protocol
  // We use localstack in TEST. Kinesis in localstack uses kinesislite which requires CBOR to be disabled
  // This is likely go away soon, see https://github.com/localstack/localstack/issues/1930
  Test / envVars := Map("AWS_CBOR_DISABLE" -> "true"),

  Test / testOptions ++= Seq(Tests.Argument(TestFrameworks.ScalaTest, "-o"), Tests.Argument(TestFrameworks.ScalaTest, "-u", "logs/test-reports")),
  libraryDependencies ++= Seq(
    "org.scalatestplus.play" %% "scalatestplus-play" % "5.1.0" % Test,
    "org.scalatestplus" %% "mockito-3-4" % "3.1.4.0" % Test,
    "org.mockito" % "mockito-core" % "2.18.0" % Test,
    "org.scalamock" %% "scalamock" % "5.1.0" % Test,
  ),
  dependencyOverrides += "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.14.3",

  Compile / doc / sources := Seq.empty,
  Compile / packageDoc / publishArtifact := false
)

//Common projects to all organizations
lazy val commonProjects: Seq[sbt.ProjectReference] = Seq(commonLib, restLib, auth, collections, cropper, imageLoader, leases, thrall, kahuna, metadataEditor, usage, mediaApi)

lazy val root = project("grid", path = Some("."))
  .aggregate((maybeBBCLib.toList ++ commonProjects):_*)

addCommandAlias("runAll", "all auth/run media-api/run thrall/run image-loader/run metadata-editor/run kahuna/run collections/run cropper/run usage/run leases/run")
addCommandAlias("runMinimal", "all auth/run media-api/run kahuna/run")

// Required to allow us to run more than four play projects in parallel from a single SBT shell
Global / concurrentRestrictions := Seq(
  Tags.limit(Tags.CPU, Math.min(1, java.lang.Runtime.getRuntime.availableProcessors - 1)),
  Tags.limit(Tags.Test, 1),
  Tags.limitAll(12)
)

val awsSdkVersion = "1.12.470"
val elastic4sVersion = "8.3.0"
val okHttpVersion = "3.12.1"

val bbcBuildProcess: Boolean = System.getenv().asScala.get("BUILD_ORG").contains("bbc")

//BBC specific project, it only gets compiled when bbcBuildProcess is true
lazy val bbcProject = project("bbc").dependsOn(restLib % "compile->compile;test->test")

val maybeBBCLib: Option[sbt.ProjectReference] = if(bbcBuildProcess) Some(bbcProject) else None

lazy val commonLib = project("common-lib").settings(
  libraryDependencies ++= Seq(
    "com.gu" %% "editorial-permissions-client" % "3.0.0",
    "com.gu" %% "pan-domain-auth-play_2-8" % "4.0.0",
    "com.amazonaws" % "aws-java-sdk-iam" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-s3" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-ec2" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-cloudwatch" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-cloudfront" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-sqs" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-sns" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-sts" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-dynamodb" % awsSdkVersion,
    "com.amazonaws" % "aws-java-sdk-kinesis" % awsSdkVersion,
    "org.elasticsearch" % "elasticsearch" % "1.7.6",
    "com.sksamuel.elastic4s" %% "elastic4s-core" % elastic4sVersion,
    "com.sksamuel.elastic4s" %% "elastic4s-client-esjava" % elastic4sVersion,
    "com.sksamuel.elastic4s" %% "elastic4s-domain" % elastic4sVersion,
    "com.gu" %% "box" % "0.2.0",
    "com.gu" %% "thrift-serializer" % "5.0.2",
    "org.scalaz.stream" %% "scalaz-stream" % "0.8.6",
    "org.im4java" % "im4java" % "1.4.0",
    "com.gu" % "kinesis-logback-appender" % "1.4.4",
    "net.logstash.logback" % "logstash-logback-encoder" % "5.0",
    "com.typesafe.play" %% "play-logback" % "2.8.20", // needed when running the scripts
    "com.typesafe.scala-logging" %% "scala-logging" % "3.9.2",
    "org.scalacheck" %% "scalacheck" % "1.14.0",
    "com.typesafe.scala-logging" %% "scala-logging" % "3.9.2",
    // needed to parse conditional statements in `logback.xml`
    // i.e. to only log to disk in DEV
    // see: https://logback.qos.ch/setup.html#janino
    "org.codehaus.janino" % "janino" % "3.0.6",
    "com.typesafe.play" %% "play-json-joda" % "2.9.2",
    "com.gu" %% "scanamo" % "1.0.0-M8",
    // Necessary to have a mix of play library versions due to scala-java8-compat incompatibility
    "com.typesafe.play" %% "play-ahc-ws" % "2.8.9",
    "org.yaml" % "snakeyaml" % "1.31",
    "org.testcontainers" % "elasticsearch" % "1.19.2" % Test
  ),
  dependencyOverrides += "org.apache.thrift" % "libthrift" % "0.13.0",
  dependencyOverrides += "ch.qos.logback" % "logback-classic" % "1.2.13" % Test
)

lazy val restLib = project("rest-lib").settings(
  libraryDependencies ++= Seq(
    "com.typesafe.play" %% "play" % "2.8.20",
    "com.typesafe.play" %% "filters-helpers" % "2.8.11",
    akkaHttpServer,
  ),

  dependencyOverrides += "org.apache.thrift" % "libthrift" % "0.9.1"
).dependsOn(commonLib % "compile->compile;test->test")

lazy val auth = playProject("auth", 9011)

lazy val collections = playProject("collections", 9010)

lazy val cropper = playProject("cropper", 9006)

lazy val imageLoader = playProject("image-loader", 9003).settings {
  libraryDependencies ++= Seq(
    "org.apache.tika" % "tika-core" % "1.20",
    "com.drewnoakes" % "metadata-extractor" % "2.17.0"
  )
}

lazy val kahuna = playProject("kahuna", 9005).settings(
  pipelineStages := Seq(digest, gzip)
)

lazy val leases = playProject("leases", 9012)

lazy val mediaApi = playProject("media-api", 9001)
  .dependsOn(commonLib % "compile;test->test")
  .settings(
    libraryDependencies ++= Seq(
      "org.apache.commons" % "commons-email" % "1.5",
      "org.parboiled" %% "parboiled" % "2.1.5",
      "org.http4s" %% "http4s-core" % "0.23.17",
      "com.softwaremill.quicklens" %% "quicklens" % "1.4.11",
    )
  )

lazy val metadataEditor = playProject("metadata-editor", 9007)

lazy val thrall = playProject("thrall", 9002)
  .dependsOn(commonLib % "compile;test->test")
  .settings(
    pipelineStages := Seq(digest, gzip),
    libraryDependencies ++= Seq(
      "org.codehaus.groovy" % "groovy-json" % "3.0.7",
      "com.yakaz.elasticsearch.plugins" % "elasticsearch-action-updatebyquery" % "2.2.0",
      "com.amazonaws" % "amazon-kinesis-client" % "1.8.10",
      "org.testcontainers" % "elasticsearch" % "1.19.2" % Test,
      "com.google.protobuf" % "protobuf-java" % "3.19.6"
    )
  )

lazy val usage = playProject("usage", 9009).settings(
  libraryDependencies ++= Seq(
    "com.gu" %% "content-api-client-default" % "19.0.4",
    "com.gu" %% "content-api-client-aws" % "0.7",
    "io.reactivex" %% "rxscala" % "0.26.5",
    "com.amazonaws" % "amazon-kinesis-client" % "1.8.10",
    "com.google.protobuf" % "protobuf-java" % "3.19.6"
  )
)

val awsSdkV2Version = "2.15.81"
lazy val scripts = project("scripts")
  .dependsOn(commonLib)
  .enablePlugins(JavaAppPackaging, UniversalPlugin)
  .settings(
    libraryDependencies ++= Seq(
      // V2 of the AWS SDK as it's easier to use for scripts and won't leak to the rest of the project from here
      "software.amazon.awssdk" % "s3" % awsSdkV2Version,
      "software.amazon.awssdk" % "dynamodb" % awsSdkV2Version,
      // bump jcommander explicitly as AWS SDK is pulling in a vulnerable version
      "com.beust" % "jcommander" % "1.75",
      "org.apache.commons" % "commons-compress" % "1.20",
      "com.github.plokhotnyuk.jsoniter-scala" %% "jsoniter-scala-core" % "2.6.4"
    )
  )

def project(projectName: String, path: Option[String] = None): Project =
  Project(projectName, file(path.getOrElse(projectName)))
    .settings(commonSettings)

def maybeLocalGit(): Option[String] = {
  try {
    Some("git rev-parse HEAD".!!.trim)
  } catch {
    case NonFatal(e) => None
  }
}

val buildInfo = Seq(
  buildInfoKeys := Seq[BuildInfoKey](
    name,
    BuildInfoKey.constant("gitCommitId", Option(System.getenv("BUILD_VCS_NUMBER")) orElse maybeLocalGit() getOrElse "unknown")
  ),
  buildInfoPackage := "utils.buildinfo",
  buildInfoOptions := Seq(
    BuildInfoOption.Traits("com.gu.mediaservice.lib.management.BuildInfo"),
    BuildInfoOption.ToJson
  )
)

def playProject(projectName: String, port: Int, path: Option[String] = None): Project = {
  val commonProject = project(projectName, path)
    .enablePlugins(PlayScala, JDebPackaging, SystemdPlugin, BuildInfoPlugin)
    .dependsOn(restLib)
    .settings(commonSettings ++ buildInfo ++ Seq(
      playDefaultPort := port,
      debianPackageDependencies := Seq("openjdk-8-jre-headless"),
      Linux / maintainer := "Guardian Developers <dig.dev.software@theguardian.com>",
      Linux / packageSummary := description.value,
      packageDescription := description.value,

      bashScriptEnvConfigLocation := Some("/etc/environment"),
      Debian / makeEtcDefault := None,
      Debian / packageBin := {
        val originalFileName = (Debian / packageBin).value
        val (base, ext) = originalFileName.baseAndExt
        val newBase = base.replace(s"_${version.value}_all","")
        val newFileName = file(originalFileName.getParent) / s"$newBase.$ext"
        IO.move(originalFileName, newFileName)
        println(s"Renamed $originalFileName to $newFileName")
        newFileName
      },
      Universal / mappings ++= Seq(
        file("common-lib/src/main/resources/application.conf") -> "conf/application.conf",
        file("common-lib/src/main/resources/logback.xml") -> "conf/logback.xml"
      ),
      Universal / javaOptions ++= Seq(
        "-Dpidfile.path=/dev/null",
        s"-Dconfig.file=/usr/share/$projectName/conf/application.conf",
        s"-Dlogger.file=/usr/share/$projectName/conf/logback.xml",
        "-J-XX:+PrintGCDetails",
        "-J-XX:+PrintGCDateStamps",
        s"-J-Xloggc:/var/log/$projectName/gc.log",
        "-J-XX:+UseGCLogFileRotation",
        "-J-XX:NumberOfGCLogFiles=5",
        "-J-XX:GCLogFileSize=2M"
      )
    ))
  //Add the BBC library dependency if defined
  maybeBBCLib.fold(commonProject){commonProject.dependsOn(_)}
}
