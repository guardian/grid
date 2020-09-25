package com.gu.mediaservice.lib.config

import java.io.File
import java.util.UUID

import com.gu.mediaservice.lib.aws.{AwsClientBuilderUtils, KinesisSenderConfig}
import com.typesafe.config.{ConfigException, ConfigFactory}
import com.typesafe.scalalogging.StrictLogging
import play.api.{Configuration, Mode}

import scala.util.Try


abstract class CommonConfig(val appName: String, playAppConfiguration: Configuration, mode: Mode) extends AwsClientBuilderUtils with StrictLogging {
  // list of files to load for each mode, later files override earlier files
  private val developerConfigFiles = Seq(
    s"${System.getProperty("user.home")}/.grid/common.conf",
    s"${System.getProperty("user.home")}/.grid/$appName.conf"
  )
  private val deployedConfigFiles = Seq(
    s"/etc/gu/grid-prod.properties",
    s"/etc/grid/common.conf",
    s"/etc/gu/$appName.properties",
    s"/etc/grid/$appName.conf"
  )

  // build the final config, any file based config overrides the play config
  val configuration: Configuration = {
    // get config from any files on the machine
    val fileConfiguration: Configuration = {
      if (mode == Mode.Test) {
        // when in test mode never load any files
        Configuration.empty
      } else if (isDev) {
        loadConfiguration(developerConfigFiles)
      } else {
        loadConfiguration(deployedConfigFiles)
      }
    }

    // merge with incoming config
    playAppConfiguration ++ fileConfiguration
  }

  final val elasticsearchStack = "media-service"

  final val elasticsearchApp = "elasticsearch"
  final val elasticsearch6App = "elasticsearch6"

  final val stackName = "media-service"

  final val sessionId = UUID.randomUUID().toString

  override val awsRegion: String = stringDefault("aws.region", "eu-west-1")

  override val awsLocalEndpoint: Option[String] = if(isDev) stringOpt("aws.local.endpoint") else None

  val authKeyStoreBucket = string("auth.keystore.bucket")

  val useLocalAuth: Boolean = isDev && boolean("auth.useLocal")

  val permissionsBucket: String = stringDefault("permissions.bucket", "permissions-cache")

  val localLogShipping: Boolean = sys.env.getOrElse("LOCAL_LOG_SHIPPING", "false").toBoolean

  val thrallKinesisStream = string("thrall.kinesis.stream.name")
  val thrallKinesisLowPriorityStream = string("thrall.kinesis.lowPriorityStream.name")

  val thrallKinesisStreamConfig = getKinesisConfigForStream(thrallKinesisStream)
  val thrallKinesisLowPriorityStreamConfig = getKinesisConfigForStream(thrallKinesisLowPriorityStream)

  val requestMetricsEnabled: Boolean = boolean("metrics.request.enabled")

  // Note: had to make these lazy to avoid init order problems ;_;
  val domainRoot: String = string("domain.root")
  val rootAppName: String = stringDefault("app.name.root", "media")
  val serviceHosts = ServiceHosts(
    stringDefault("hosts.kahunaPrefix", s"$rootAppName."),
    stringDefault("hosts.apiPrefix", s"api.$rootAppName."),
    stringDefault("hosts.loaderPrefix", s"loader.$rootAppName."),
    stringDefault("hosts.cropperPrefix", s"cropper.$rootAppName."),
    stringDefault("hosts.adminToolsPrefix", s"admin-tools.$rootAppName."),
    stringDefault("hosts.metadataPrefix", s"$rootAppName-metadata."),
    stringDefault("hosts.imgopsPrefix", s"$rootAppName-imgops."),
    stringDefault("hosts.usagePrefix", s"$rootAppName-usage."),
    stringDefault("hosts.collectionsPrefix", s"$rootAppName-collections."),
    stringDefault("hosts.leasesPrefix", s"$rootAppName-leases."),
    stringDefault("hosts.authPrefix", s"$rootAppName-auth.")
  )

  val corsAllowedOrigins: Set[String] = getStringSet("security.cors.allowedOrigins")

  val services = new Services(domainRoot, serviceHosts, corsAllowedOrigins)

  private def getKinesisConfigForStream(streamName: String) = KinesisSenderConfig(awsRegion, awsCredentials, awsLocalEndpoint, streamName)

  final def getStringSet(key: String): Set[String] = Try {
    configuration.get[Seq[String]](key)
  }.recover {
    case _:ConfigException.WrongType => configuration.get[String](key).split(",").toSeq.map(_.trim)
  }.map(_.toSet)
   .getOrElse(Set.empty)

  final def apply(key: String): String =
    string(key)

  final def string(key: String): String =
    configuration.getOptional[String](key) getOrElse missing(key, "string")

  final def stringDefault(key: String, default: String): String =
    configuration.getOptional[String](key) getOrElse default

  final def stringOpt(key: String): Option[String] = configuration.getOptional[String](key)

  final def int(key: String): Int =
    configuration.getOptional[Int](key) getOrElse missing(key, "integer")

  final def intDefault(key: String, default: Int): Int =
    configuration.getOptional[Int](key) getOrElse default

  final def boolean(key: String): Boolean =
    configuration.getOptional[Boolean](key).getOrElse(false)

  private def missing(key: String, type_ : String): Nothing =
    sys.error(s"Required $type_ configuration property missing: $key")

  private def loadConfiguration(file: File): Configuration = {
    if (file.exists) {
      logger.info(s"Loading config from $file")
      Configuration(ConfigFactory.parseFile(file))
    } else {
      logger.info(s"Skipping config file $file as it doesn't exist")
      Configuration.empty
    }
  }

  private def loadConfiguration(fileNames: Seq[String]): Configuration =
    fileNames.foldLeft(Configuration.empty) { case (config, fileName) =>
      config ++ loadConfiguration(new File(fileName))
    }
}
