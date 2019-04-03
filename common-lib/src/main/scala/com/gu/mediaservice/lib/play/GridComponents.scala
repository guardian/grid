package com.gu.mediaservice.lib.play

import com.amazonaws.auth.{AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.gu.mediaservice.lib.auth.{Authentication, KeyStore}
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.lib.management.Management
import com.gu.pandomainauth.PanDomainAuthSettingsRefresher
import play.api.ApplicationLoader.Context
import play.api.BuiltInComponentsFromContext
import play.api.libs.ws.ahc.AhcWSComponents
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSConfig.Origins
import play.filters.cors.{CORSComponents, CORSConfig}
import play.filters.gzip.GzipFilterComponents

import scala.concurrent.ExecutionContext
import scala.collection.JavaConverters._

abstract class GridComponents(protected val context: Context) extends BuiltInComponentsFromContext(context)
  with AhcWSComponents with HttpFiltersComponents with CORSComponents with GzipFilterComponents {

  implicit val ec: ExecutionContext = executionContext

  val config = context.initialConfiguration

  val region = config.get[String]("aws.region")
  val domainRoot = config.get[String]("domain.root")

  val awsCredentials = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("media-service"),
    InstanceProfileCredentialsProvider.getInstance()
  )

  val services = new Services(domainRoot)

  final override def httpFilters: Seq[EssentialFilter] = {
    Seq(corsFilter, csrfFilter, securityHeadersFilter, gzipFilter, new RequestLoggingFilter(materializer))
  }

  val management = new Management(controllerComponents)
}

trait GridAuthentication { this: GridComponents =>
  val userValidationEmailDomain = config.get[String]("panda.userDomain")
  val authKeyStoreBucket = config.get[String]("auth.keystore.bucket")

  val s3Client = AmazonS3ClientBuilder.standard().withRegion(region).withCredentials(awsCredentials).build()

  val pandaSettings = new PanDomainAuthSettingsRefresher(
    domain = services.domainRoot,
    system = config.get[String]("panda.system"),
    bucketName = config.get[String]("panda.bucketName"),
    settingsFileKey = config.get[String]("panda.settingsFileKey"),
    s3Client
  )

  val keyStore = new KeyStore(authKeyStoreBucket, s3Client)
  keyStore.scheduleUpdates(actorSystem.scheduler)
  val auth = new Authentication(services, userValidationEmailDomain, keyStore, pandaSettings, defaultBodyParser, wsClient, controllerComponents, executionContext)
}

trait GridCORSAuthentication extends GridAuthentication { this: GridComponents =>
  val corsAllowedTools = config.underlying.getStringList("domain.cors").asScala

  final override lazy val corsConfig: CORSConfig = CORSConfig.fromConfiguration(context.initialConfiguration).copy(
    allowedOrigins = Origins.Matching(Set(services.kahunaBaseUri) ++ corsAllowedTools)
  )
}
