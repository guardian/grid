import play.sbt.PlayImport.PlayKeys._
import sbt.Package.FixedTimestamp

import scala.sys.process._
import scala.util.control.NonFatal
import scala.collection.JavaConverters._
import com.typesafe.sbt.packager.docker._

// We need to keep the timestamps to allow caching headers to work as expected on assets.
// The below should work, but some problem in one of the plugins (possible the play plugin? or sbt-web?) causes
// the option not to be passed correctly
//   ThisBuild / packageTimestamp := Package.keepTimestamps
// Setting as a packageOption seems to bypass that problem, wherever it lies
ThisBuild / packageOptions += FixedTimestamp(Package.keepTimestamps)

// Currently multiple modules depend on scala-java8-compat, some on 0.8.x, 0.9.x and 1.x.y
// These may be binary incompatible, but force the checker to accept them
// In the future, check if this override can be removed
ThisBuild / libraryDependencySchemes +=
  "org.scala-lang.modules" %% "scala-java8-compat" % VersionScheme.Always

val commonSettings = Seq(
  scalaVersion := "2.13.16",
  description := "grid",
  organization := "com.gu",
  version := "0.1",
  scalacOptions ++= Seq("-feature", "-deprecation", "-language:higherKinds", "-Xfatal-warnings", "-release:11"),

  // The Java SDK uses CBOR protocol
  // We use localstack in TEST. Kinesis in localstack uses kinesislite which requires CBOR to be disabled
  // This is likely go away soon, see https://github.com/localstack/localstack/issues/1930
  Test / envVars := Map("AWS_CBOR_DISABLE" -> "true"),

  Test / testOptions ++= Seq(Tests.Argument(TestFrameworks.ScalaTest, "-o"), Tests.Argument(TestFrameworks.ScalaTest, "-u", "logs/test-reports")),
  libraryDependencies ++= Seq(
    "org.scalatest" %% "scalatest" % "3.2.19" % Test,
    "org.scalatestplus.play" %% "scalatestplus-play" % "7.0.1" % Test,
    "org.scalatestplus" %% "mockito-3-4" % "3.1.4.0" % Test,
    "org.mockito" % "mockito-core" % "2.18.0" % Test,
    "org.scalamock" %% "scalamock" % "5.1.0" % Test,
  ),
  dependencyOverrides += "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.17.2",

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
val awsSdkV2Version = "2.31.12"
val elastic4sVersion = "8.3.0"
val okHttpVersion = "3.12.1"

val bbcBuildProcess: Boolean = System.getenv().asScala.get("BUILD_ORG").contains("bbc")

//BBC specific project, it only gets compiled when bbcBuildProcess is true
lazy val bbcProject = project("bbc").dependsOn(restLib % "compile->compile;test->test")

val maybeBBCLib: Option[sbt.ProjectReference] = if(bbcBuildProcess) Some(bbcProject) else None

lazy val commonLib = project("common-lib").settings(
  libraryDependencies ++= Seq(
    "com.gu" %% "editorial-permissions-client" % "4.0.0",
    "com.gu" %% "pan-domain-auth-play_3-0" % "9.0.0",
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
    "com.sksamuel.elastic4s" %% "elastic4s-core" % elastic4sVersion,
    "com.sksamuel.elastic4s" %% "elastic4s-client-esjava" % elastic4sVersion,
    "com.sksamuel.elastic4s" %% "elastic4s-domain" % elastic4sVersion,
    "com.gu" %% "thrift-serializer" % "5.0.2",
    "org.scalaz" %% "scalaz-core" % "7.3.8",
    "org.im4java" % "im4java" % "1.4.0",
    "com.gu" % "kinesis-logback-appender" % "1.4.4",
    "net.logstash.logback" % "logstash-logback-encoder" % "5.0",
    logback, // play-logback; needed when running the scripts
    "com.typesafe.scala-logging" %% "scala-logging" % "3.9.2",
    "org.scalacheck" %% "scalacheck" % "1.14.0",
    // needed to parse conditional statements in `logback.xml`
    // i.e. to only log to disk in DEV
    // see: https://logback.qos.ch/setup.html#janino
    "org.codehaus.janino" % "janino" % "3.0.6",
    "org.playframework" %% "play-json-joda" % "3.0.4",
    "org.scanamo" %% "scanamo" % "2.0.0",
    // declare explicit dependency on desired version of aws sdk v2 dynamo
    "software.amazon.awssdk" % "dynamodb" % awsSdkV2Version,
    ws,
    "org.testcontainers" % "elasticsearch" % "1.19.2" % Test
  ),
  dependencyOverrides += "ch.qos.logback" % "logback-classic" % "1.2.13" % Test
)

lazy val restLib = project("rest-lib").settings(
  libraryDependencies ++= Seq(
    playCore,
    filters,
    pekkoHttpServer,
  ),
).dependsOn(commonLib % "compile->compile;test->test")

lazy val auth = playProject("auth", 9011)

lazy val collections = playProject("collections", 9010)

lazy val cropper = playProject("cropper", 9006)

lazy val imageLoader = playImageLoaderProject("image-loader", 9003).settings {
  libraryDependencies ++= Seq(
    "org.apache.tika" % "tika-core" % "1.28.5",
    "com.drewnoakes" % "metadata-extractor" % "2.19.0"
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
      "org.parboiled" %% "parboiled" % "2.1.7",
      "org.http4s" %% "http4s-core" % "0.23.17",
    )
  )

lazy val metadataEditor = playProject("metadata-editor", 9007)

lazy val thrall = playProject("thrall", 9002)
  .dependsOn(commonLib % "compile;test->test")
  .settings(
    pipelineStages := Seq(digest, gzip),
    libraryDependencies ++= Seq(
      "org.codehaus.groovy" % "groovy-json" % "3.0.7",
      // TODO upgrading kcl to v3? check if you can remove avro override below
      "software.amazon.kinesis" % "amazon-kinesis-client" % "2.6.1",
      // explicit dependencies on kinesis and dynamodb to upgrade the versions used by kcl
      "software.amazon.awssdk" % "kinesis" % awsSdkV2Version,
      "software.amazon.awssdk" % "dynamodb" % awsSdkV2Version,
      "com.gu" %% "kcl-pekko-stream" % "0.1.0",
      "org.testcontainers" % "elasticsearch" % "1.19.2" % Test,
      "com.google.protobuf" % "protobuf-java" % "3.19.6"
    ),
    // amazon-kinesis-client 2.6.0 brings in a critically vulnerable version of apache avro,
    // but we cannot upgrade amazon-kinesis-client further without performing the v2->v3 upgrade https://docs.aws.amazon.com/streams/latest/dev/kcl-migration-from-2-3.html
    dependencyOverrides ++= Seq(
      "org.apache.avro" % "avro" % "1.11.4",
      "org.apache.pekko" %% "pekko-stream" % "1.0.3"
    )
  )

lazy val usage = playProject("usage", 9009).settings(
  libraryDependencies ++= Seq(
    "com.gu" %% "content-api-client-default" % "32.0.0",
    "com.gu" %% "content-api-client-aws" % "0.7.6",
    "io.reactivex" %% "rxscala" % "0.27.0",
    // amazon-kinesis-client brings in a critical vulnerability warning through apache avro, resolved in versions 1.11.4 and 1.12.0.
    // updating amazon-kinesis-client? check if the override below can be removed
    "software.amazon.kinesis" % "amazon-kinesis-client" % "3.0.2",
    // explicit dependencies on kinesis and dynamodb to upgrade the versions used by kcl
    "software.amazon.awssdk" % "kinesis" % awsSdkV2Version,
    "software.amazon.awssdk" % "dynamodb" % awsSdkV2Version,
    "com.google.protobuf" % "protobuf-java" % "3.19.6"
  ),
  dependencyOverrides ++= Seq(
    "org.apache.avro" % "avro" % "1.11.4",
  )
)

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
      "org.apache.commons" % "commons-compress" % "1.27.1",
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
  project(projectName, path)
    .enablePlugins(PlayScala, BuildInfoPlugin, DockerPlugin)
    .dependsOn(restLib)
    .settings(commonSettings ++ buildInfo ++ Seq(
      dockerBaseImage := "openjdk:11-jre",
      dockerExposedPorts in Docker := Seq(port),
      playDefaultPort := port,
      debianPackageDependencies := Seq("java11-runtime-headless"),
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
        s"-Dconfig.file=/opt/docker/conf/application.conf",
        s"-Dlogger.file=/opt/docker/conf/logback.xml"
      )))
}

def playImageLoaderProject(projectName: String, port: Int, path: Option[String] = None): Project = {
  project(projectName, path)
    .enablePlugins(PlayScala, BuildInfoPlugin, DockerPlugin)
    .dependsOn(restLib)
    .settings(commonSettings ++ buildInfo ++ Seq(
      dockerBaseImage := "openjdk:11-jre",
      dockerExposedPorts in Docker := Seq(port),
      dockerCommands ++= Seq(
        Cmd("USER", "root"), Cmd("RUN", "apt-get", "update"),
        Cmd("RUN", "apt-get", "install", "-y", "apt-utils"),
        Cmd("RUN", "apt-get", "install", "-y", "graphicsmagick"),
        Cmd("RUN", "apt-get", "install", "-y", "graphicsmagick-imagemagick-compat"),
        Cmd("RUN", "apt-get", "install", "-y", "pngquant"),
        Cmd("RUN", "apt-get", "install", "-y", "libimage-exiftool-perl")
      ),
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
        val newBase = base.replace(s"_${version.value}_all", "")
        val newFileName = file(originalFileName.getParent) / s"$newBase.$ext"
        IO.move(originalFileName, newFileName)
        println(s"Renamed $originalFileName to $newFileName")
        newFileName
      },
      Universal / mappings ++= Seq(
        file("common-lib/src/main/resources/application.conf") -> "conf/application.conf",
        file("common-lib/src/main/resources/logback.xml") -> "conf/logback.xml",
        file("image-loader/cmyk.icc") -> "cmyk.icc",
        file("image-loader/facebook-TINYsRGB_c2.icc") -> "facebook-TINYsRGB_c2.icc",
        file("image-loader/grayscale.icc") -> "grayscale.icc",
        file("image-loader/srgb.icc") -> "srgb.icc"
      ),
      Universal / javaOptions ++= Seq(
        "-Dpidfile.path=/dev/null",
        s"-Dconfig.file=/opt/docker/conf/application.conf",
        s"-Dlogger.file=/opt/docker/conf/logback.xml"
      )))
}
