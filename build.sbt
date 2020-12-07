import play.sbt.PlayImport.PlayKeys._

import scala.sys.process._
import scala.util.control.NonFatal

val commonSettings = Seq(
  scalaVersion := "2.12.10",
  description := "grid",
  organization := "com.gu",
  version := "0.1",
  scalacOptions ++= Seq("-feature", "-deprecation", "-language:higherKinds", "-Xfatal-warnings"),

  // The Java SDK uses CBOR protocol
  // We use localstack in TEST. Kinesis in localstack uses kinesislite which requires CBOR to be disabled
  // This is likely go away soon, see https://github.com/localstack/localstack/issues/1930
  envVars in Test := Map("AWS_CBOR_DISABLE" -> "true"),

  testOptions in Test ++= Seq(Tests.Argument(TestFrameworks.ScalaTest, "-o"), Tests.Argument(TestFrameworks.ScalaTest, "-u", "logs/test-reports")),
  libraryDependencies ++= Seq(
    "org.scalatest" %% "scalatest" % "3.0.5",
    "org.mockito" % "mockito-core" % "2.18.0"
  )
)

lazy val root = project("grid", path = Some("."))
  .aggregate(commonLib, auth, collections, cropper, imageLoader, leases, thrall, kahuna, metadataEditor, usage, mediaApi, adminToolsLambda, adminToolsScripts, adminToolsDev)
  .enablePlugins(RiffRaffArtifact)
  .settings(
    riffRaffManifestProjectName := s"media-service::grid::all",
    riffRaffUploadArtifactBucket := Some("riffraff-artifact"),
    riffRaffUploadManifestBucket := Some("riffraff-builds"),
    riffRaffArtifactResources := Seq(
      (packageBin in Debian in auth).value -> s"${(name in auth).value}/${(name in auth).value}.deb",
      (packageBin in Debian in collections).value -> s"${(name in collections).value}/${(name in collections).value}.deb",
      (packageBin in Debian in cropper).value -> s"${(name in cropper).value}/${(name in cropper).value}.deb",
      (packageBin in Debian in imageLoader).value -> s"${(name in imageLoader).value}/${(name in imageLoader).value}.deb",
      // image-loader-projection uses the same deb as image-loader, we're running it for isolation of traffic in batch reindexing
      (packageBin in Debian in imageLoader).value -> s"${(name in imageLoader).value}-projection/${(name in imageLoader).value}-projection.deb",
      (packageBin in Debian in leases).value -> s"${(name in leases).value}/${(name in leases).value}.deb",
      (packageBin in Debian in thrall).value -> s"${(name in thrall).value}/${(name in thrall).value}.deb",
      (packageBin in Debian in kahuna).value -> s"${(name in kahuna).value}/${(name in kahuna).value}.deb",
      (packageBin in Debian in metadataEditor).value -> s"${(name in metadataEditor).value}/${(name in metadataEditor).value}.deb",
      (packageBin in Debian in usage).value -> s"${(name in usage).value}/${(name in usage).value}.deb",
      (packageBin in Debian in mediaApi).value -> s"${(name in mediaApi).value}/${(name in mediaApi).value}.deb",
      // pull in s3watcher build
      file("s3watcher/lambda/target/s3watcher.zip") -> "s3watcher/s3watcher.zip",
      file("riff-raff.yaml") -> "riff-raff.yaml"
    )
  )

addCommandAlias("runAll", "all auth/run media-api/run thrall/run image-loader/run metadata-editor/run kahuna/run collections/run cropper/run usage/run leases/run admin-tools-dev/run")

// Required to allow us to run more than four play projects in parallel from a single SBT shell
Global / concurrentRestrictions := Seq(
  Tags.limit(Tags.CPU, Math.min(1, java.lang.Runtime.getRuntime.availableProcessors - 1)),
  Tags.limit(Tags.Test, 1),
  Tags.limitAll(12)
)

val awsSdkVersion = "1.11.302"
val elastic4sVersion = "7.3.5"
val okHttpVersion = "3.12.1"

lazy val commonLib = project("common-lib").settings(
  libraryDependencies ++= Seq(
    // also exists in plugins.sbt, TODO deduplicate this
    "com.typesafe.play" %% "play" % "2.6.20", ws,
    "com.typesafe.play" %% "play-json-joda" % "2.6.9",
    "com.typesafe.play" %% "filters-helpers" % "2.6.20",
    akkaHttpServer,
    ws,
    "com.gu" %% "pan-domain-auth-play_2-6" % "0.8.2",
    "com.gu" %% "editorial-permissions-client" % "2.0",
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
    "com.gu" %% "box" % "0.2.0",
    "com.gu" %% "thrift-serializer" % "4.0.0",
    "org.scalaz.stream" %% "scalaz-stream" % "0.8.6",
    "com.drewnoakes" % "metadata-extractor" % "2.15.0",
    "org.im4java" % "im4java" % "1.4.0",
    "com.gu" % "kinesis-logback-appender" % "1.4.2",
    "net.logstash.logback" % "logstash-logback-encoder" % "5.0",
    "com.typesafe.play" %% "play-logback" % "2.6.15", // needed when running the scripts
    "com.typesafe.scala-logging" %% "scala-logging" % "3.9.2",
    "org.scalacheck" %% "scalacheck" % "1.14.0",
    "com.typesafe.scala-logging" %% "scala-logging" % "3.9.2",
    // needed to parse conditional statements in `logback.xml`
    // i.e. to only log to disk in DEV
    // see: https://logback.qos.ch/setup.html#janino
    "org.codehaus.janino" % "janino" % "3.0.6"
),
  dependencyOverrides += "org.apache.thrift" % "libthrift" % "0.9.1"
)

lazy val auth = playProject("auth", 9011)

lazy val collections = playProject("collections", 9010)

lazy val cropper = playProject("cropper", 9006)

lazy val imageLoader = playProject("image-loader", 9003).settings {
  libraryDependencies ++= Seq(
    "com.squareup.okhttp3" % "okhttp" % okHttpVersion,
    "org.apache.tika" % "tika-core" % "1.20"
  )
}

lazy val kahuna = playProject("kahuna", 9005)

lazy val leases = playProject("leases", 9012).settings(
  libraryDependencies ++= Seq(
    "com.gu" %% "scanamo" % "1.0.0-M8"
  )
)

lazy val mediaApi = playProject("media-api", 9001).settings(
  libraryDependencies ++= Seq(
    "org.apache.commons" % "commons-email" % "1.5",
    "org.parboiled" %% "parboiled" % "2.1.5",
    "org.http4s" %% "http4s-core" % "0.18.7",
    "com.softwaremill.quicklens" %% "quicklens" % "1.4.11",
    "com.whisk" %% "docker-testkit-scalatest" % "0.9.8" % Test,
    "com.whisk" %% "docker-testkit-impl-spotify" % "0.9.8" % Test
  )
)

lazy val adminToolsLib = project("admin-tools-lib", Some("admin-tools/lib"))
  .settings(
    excludeDependencies ++= Seq(
      ExclusionRule("org.elasticsearch"),
      ExclusionRule("com.sksamuel.elastic4s"),
      ExclusionRule("com.drewnoakes", "metadata-extractor"),
      ExclusionRule("org.codehaus.janino"),
      ExclusionRule("com.typesafe.play"),
      ExclusionRule("org.scalaz.stream"),
      ExclusionRule("org.im4java"),
      ExclusionRule("org.scalacheck"),
      ExclusionRule("com.gu", "kinesis-logback-appender")
    ),
    libraryDependencies ++= Seq(
      "com.squareup.okhttp3" % "okhttp" % okHttpVersion,
      "com.typesafe.play" %% "play-json" % "2.6.9",
      "com.typesafe.play" %% "play-json-joda" % "2.6.9",
      "com.typesafe.play" %% "play-functional" % "2.6.9",
      "io.symphonia" % "lambda-logging" % "1.0.3",
    )
  ).dependsOn(commonLib)

lazy val adminToolsLambda = project("admin-tools-lambda", Some("admin-tools/lambda"))
  .enablePlugins(RiffRaffArtifact)
  .settings(
    assemblyMergeStrategy in assembly := {
      case PathList("META-INF", xs@_*) => MergeStrategy.discard
      case "logback.xml" => MergeStrategy.first
      case x => MergeStrategy.first
    },
    libraryDependencies ++= Seq(
      "com.amazonaws" % "aws-lambda-java-core" % "1.2.0",
      "com.amazonaws" % "aws-lambda-java-events" % "2.2.7",
    )
  )
  .dependsOn(adminToolsLib)
  .settings(
    assemblyJarName := s"${name.value}.jar",
    riffRaffPackageType := assembly.value,
    riffRaffUploadArtifactBucket := Some("riffraff-artifact"),
    riffRaffUploadManifestBucket := Some("riffraff-builds"),
    riffRaffManifestProjectName := s"media-service::grid::admin-tools-lambda"
  )

lazy val adminToolsScripts = project("admin-tools-scripts", Some("admin-tools/scripts"))
  .settings(
    assemblyMergeStrategy in assembly := {
      case PathList("META-INF", xs@_*) => MergeStrategy.discard
      case "logback.xml" => MergeStrategy.first
      case x => MergeStrategy.first
    }
  ).dependsOn(adminToolsLib)

lazy val adminToolsDev = playProject("admin-tools-dev", 9013, Some("admin-tools/dev"))
  .dependsOn(adminToolsLib)

lazy val metadataEditor = playProject("metadata-editor", 9007)

resolvers in ThisBuild += Resolver.bintrayRepo("streetcontxt", "maven")

lazy val thrall = playProject("thrall", 9002).settings(
  libraryDependencies ++= Seq(
    "org.codehaus.groovy" % "groovy-json" % "2.4.4",
    "com.yakaz.elasticsearch.plugins" % "elasticsearch-action-updatebyquery" % "2.2.0",
    "com.amazonaws" % "amazon-kinesis-client" % "1.8.10",
    "com.streetcontxt" %% "kcl-akka-stream" % "2.1.0",
    "com.whisk" %% "docker-testkit-scalatest" % "0.9.8" % Test,
    "com.whisk" %% "docker-testkit-impl-spotify" % "0.9.8" % Test
  )
)

lazy val usage = playProject("usage", 9009).settings(
  libraryDependencies ++= Seq(
    "com.gu" %% "content-api-client-default" % "14.2",
    "io.reactivex" %% "rxscala" % "0.26.5",
    "com.amazonaws" % "amazon-kinesis-client" % "1.8.10"
  )
)

lazy val scripts = project("scripts")
  .dependsOn(commonLib)

lazy val migration = project("migration")
  .dependsOn(commonLib).
  settings(commonSettings,
    mainClass in Compile := Some("Main"),
    assemblyMergeStrategy in assembly := {
      case PathList("META-INF", xs@_*) => MergeStrategy.discard
      case _ => MergeStrategy.first
    })

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

def playProject(projectName: String, port: Int, path: Option[String] = None): Project =
  project(projectName, path)
    .enablePlugins(PlayScala, JDebPackaging, SystemdPlugin, BuildInfoPlugin)
    .dependsOn(commonLib)
    .settings(commonSettings ++ buildInfo ++ Seq(
      playDefaultPort := port,

      debianPackageDependencies := Seq("openjdk-8-jre-headless"),
      maintainer in Linux := "Guardian Developers <dig.dev.software@theguardian.com>",
      packageSummary in Linux := description.value,
      packageDescription := description.value,

      mappings in Universal ++= Seq(
        file("common-lib/src/main/resources/application.conf") -> "conf/application.conf",
        file("common-lib/src/main/resources/logback.xml") -> "conf/logback.xml"
      ),
      javaOptions in Universal ++= Seq(
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
