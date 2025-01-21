package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.aws.{AwsClientV1BuilderUtils, AwsClientV2BuilderUtils, KinesisSenderConfig}
import com.gu.mediaservice.model.UsageRightsSpec
import com.typesafe.config.Config
import com.typesafe.scalalogging.StrictLogging
import play.api.{ConfigLoader, Configuration}

import java.net.URI
import java.util.UUID
import scala.jdk.CollectionConverters._
import scala.util.Try

abstract class CommonConfig(resources: GridConfigResources) extends AwsClientV1BuilderUtils with AwsClientV2BuilderUtils with StrictLogging {
  val configuration: Configuration = resources.configuration
  final val stackName = "media-service"

  final val sessionId = UUID.randomUUID().toString

  // TODO:SAH - remove these and favour explicit config for anything that is derived from here
  val stage: String = string(GridConfigLoader.STAGE_KEY)
  val appName: String = string(GridConfigLoader.APP_KEY)
  val isProd: Boolean = stage == "PROD"
  override val isDev: Boolean = stage == "DEV"

  override val awsRegion: String = stringDefault("aws.region", "eu-west-1")

  override val awsLocalEndpoint: Option[String] = if(isDev) stringOpt("aws.local.endpoint").filter(_.nonEmpty) else None
  override val awsLocalEndpointUri: Option[URI] = awsLocalEndpoint.map(new URI(_))

  val useLocalAuth: Boolean = isDev && boolean("auth.useLocal")

  val localLogShipping: Boolean = sys.env.getOrElse("LOCAL_LOG_SHIPPING", "false").toBoolean

  val thrallKinesisStream = string("thrall.kinesis.stream.name")
  val thrallKinesisLowPriorityStream = string("thrall.kinesis.lowPriorityStream.name")

  val thrallKinesisStreamConfig = getKinesisConfigForStream(thrallKinesisStream)
  val thrallKinesisLowPriorityStreamConfig = getKinesisConfigForStream(thrallKinesisLowPriorityStream)

  val requestMetricsEnabled: Boolean = boolean("metrics.request.enabled")

  val defaultShouldBlurGraphicImages: Boolean = boolean("defaultShouldBlurGraphicImages")

  val staffPhotographerOrganisation: String = stringOpt("branding.staffPhotographerOrganisation").filterNot(_.isEmpty).getOrElse("GNM")

  val shouldDisplayOrgOwnedCountAndFilterCheckbox: Boolean = boolean("filters.shouldDisplayOrgOwnedCountAndFilterCheckbox")

  val systemName: String = stringOpt("branding.systemName").filterNot(_.isEmpty).getOrElse("the Grid")

  lazy val softDeletedMetadataTable: String = string("dynamo.table.softDelete.metadata")

  val maybeIngestSqsQueueUrl: Option[String] = stringOpt("sqs.ingest.queue.url")
  val maybeIngestBucket: Option[String] = stringOpt("s3.ingest.bucket")
  val maybeFailBucket: Option[String] = stringOpt("s3.fail.bucket")

  val maybeUploadLimitInBytes: Option[Int] = intOpt("upload.limit.mb").map(_ * 1024 * 1024)

  // Note: had to make these lazy to avoid init order problems ;_;
  val domainRoot: String = string("domain.root")
  val domainRootOverride: Option[String] = stringOpt("domain.root-override")
  val rootAppName: String = stringDefault("app.name.root", "media")

  val corsAllowedOrigins: Set[String] = getStringSet("security.cors.allowedOrigins")

  val services = new SingleHostServices(domainRoot)

  /**
   * Load in a list of domain metadata specifications from configuration. For example:
   * {{{
   *   domainMetadata.specifications = [
   *     {
   *       name: "specificationa"
   *       label: "Specification A"
   *       description: "Description of specification A"
   *       fields = [
   *         {
   *           name = "field-a"
   *           label = "Field A"
   *           type = "string" # type can either be string, integer, select or datetime
   *         }
   *         {
   *           name = "field-b"
   *           label = "Field B"
   *           type = "integer"
   *         }
   *         {
   *           name = "field-c"
   *           label = "Field C"
   *           type = "datetime"
   *         }
   *         {
   *           name = "field-d"
   *           label = "Field D"
   *           type = "select"
   *           options = ["Option 1", "Option 2"]
   *         }
   *       ]
   *     }
   *   ]
   * }}}
   */
  val domainMetadataSpecs: Seq[DomainMetadataSpec] = configuration.getOptional[Seq[DomainMetadataSpec]]("domainMetadata.specifications").getOrElse(Seq.empty)

  val fieldAliasConfigs: Seq[FieldAlias] = configuration.get[Seq[FieldAlias]]("field.aliases")

  val recordDownloadAsUsage: Boolean = boolean("image.record.download")
  val shortenDownloadFilename: Boolean = boolean("image.download.shorten")
  val myInstancesEndpoint: String = string("instance.service.my")
  val apiKeyEndpoint: String = string("instance.service.apikey")

  val usageEventsQueueName: String = string("usageEvents.queue.name")

  /**
   * Load in a list of external staff photographers, internal staff photographers, contracted photographers,
   * contract illustrators, staff illustrators and creative commons licenses. For example:
   * {{{
   *   usageRightsConfigProvider {
   *     className: "com.gu.mediaservice.lib.config.RuntimeUsageRightsConfig"
   *     config {
   *      externalStaffPhotographers = [
   *        {
   *          name = "Publication 1",
   *          photographers = ["John Doe"]
   *        }
   *      ]
   *      internalStaffPhotographers = [
   *        {
   *          name = "Publication 1",
   *          photographers = ["Jane Doe"]
   *        }
   *      ]
   *      contractedPhotographers = [
   *        {
   *          name = "Contract Photographers 1",
   *          photographers = ["Peter Larry"]
   *        }
   *      ]
   *      contractIllustrators = [
   *        {
   *          name = "Contract Illustrators 1",
   *          photographers = ["Tom Hardy"]
   *        }
   *      ]
   *      staffIllustrators = ["John Doe", "Jane Doe", "Larry Wolf"]
   *      creativeCommonsLicense = [
   *        "CC BY-4.0",
   *        "CC BY-SA-4.0",
   *        "CC BY-ND-4.0"
   *      ]
   *      freeSuppliers = ["Supplier 1", "Supplier 2"]
   *      suppliersCollectionExcl {
   *        Supplier 1 = ["Coll 1", "Coll 2"]
   *      }
   *      programmesOrganisationOwned {
   *        description = "This is a configurable description of the usage right." # Optional config - if not sensible default description is used
   *      }
   *      programmesIndependents {
   *        description = "This is a configurable description of the usage right." # Optional config - if not sensible default description is used
   *        independentTypes = [
   *          {
   *            name = "BBC Studios"
   *            productionsCompanies = ["Studio 1", "Studio 2"]
   *          }
   *          {
   *            name = "Independent"
   *            productionsCompanies = ["A", "B", "C"]
   *          }
   *          {
   *            name = "Joint Production"
   *            productionsCompanies = ["Joint Prod 1", "Joint Prod 2"]
   *          }
   *        ]
   *      }
   *      programmesAcquisitions {
   *        description = "This is a configurable description of the usage right." # Optional config - if not sensible default description is used
   *      }
   *    }
   *   }
   * }}}
   */
  val usageRightsConfig: UsageRightsConfigProvider = {
    implicit val loader: ConfigLoader[UsageRightsConfigProvider] =
      UsageRightsConfigProvider.ProviderLoader.singletonConfigLoader(UsageRightsConfigProvider.Resources(), resources.applicationLifecycle)
    configuration.get[UsageRightsConfigProvider]("usageRightsConfigProvider")
  }

  /**
   * Load in a list of applicable usage right objects that implement [[com.gu.mediaservice.model.UsageRightsSpec]] from config. For example:
   * {{{
   * usageRights.applicable = [
   *   "com.gu.mediaservice.model.NoRights",
   *   "com.gu.mediaservice.model.Handout"
   * ]
   * }}}
   *
   * Depending on the type it will be loaded differently using reflection. Companion objects will be looked up
   * and the singleton instance added to the list.
   */
  val applicableUsageRights: Seq[UsageRightsSpec] = configuration.get[Seq[UsageRightsSpec]]("usageRights.applicable")
  val stdUserExcludedUsageRights = getStringSet("usageRights.stdUserExcluded")

  private def getKinesisConfigForStream(streamName: String) = KinesisSenderConfig(awsRegion, awsCredentials, awsLocalEndpoint, isDev, streamName)

  final def getOptionalStringSet(key: String): Option[Set[String]] = Try {
    configuration.getOptional[Seq[String]](key)
  }.getOrElse(
    configuration.getOptional[String](key).map(_.split(",").toSeq.map(_.trim))
  ).map(_.toSet)

  final def getStringSet(key: String): Set[String] = getOptionalStringSet(key).getOrElse(Set.empty)

  def getConfigList(key:String): List[_ <: Config] =
    if (configuration.has(key)) configuration.underlying.getConfigList(key).asScala.toList
    else List.empty

  final def apply(key: String): String =
    string(key)

  final def string(key: String): String =
    configuration.getOptional[String](key) getOrElse missing(key, "string")

  final def stringDefault(key: String, default: String): String =
    configuration.getOptional[String](key) getOrElse default

  final def stringOpt(key: String): Option[String] = configuration.getOptional[String](key)

  final def intOpt(key: String): Option[Int] =  configuration.getOptional[Int](key)

  final def intDefault(key: String, default: Int): Int =
    configuration.getOptional[Int](key) getOrElse default

  final def boolean(key: String): Boolean =
    configuration.getOptional[Boolean](key).getOrElse(false)

  final def booleanOpt(key: String): Option[Boolean] =
    configuration.getOptional[Boolean](key)

  private def missing(key: String, type_ : String): Nothing =
    sys.error(s"Required $type_ configuration property missing: $key")

}
