package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.typesafe.config.ConfigException.BadValue
import com.typesafe.config.{Config, ConfigObject, ConfigOrigin, ConfigValue, ConfigValueType}
import com.typesafe.scalalogging.StrictLogging
import play.api.{ConfigLoader, Configuration}

import scala.collection.JavaConverters._
import scala.language.existentials
import scala.util.Try
import scala.util.control.NonFatal

object ImageProcessorLoader extends StrictLogging {
  case class ImageProcessorConfigDetails(className: String, config: Option[Configuration], moduleConfiguration: Configuration, origin: ConfigOrigin, path: String)

  def imageProcessorsConfigLoader(moduleConfiguration: Configuration): ConfigLoader[Seq[ImageProcessor]] = (config: Config, path: String) => {
    config
      .getList(path)
      .iterator()
      .asScala.map { configValue =>
      parseConfigValue(configValue, path, moduleConfiguration)
    }.map(loadImageProcessor).toList
  }

  def imageProcessorConfigLoader(moduleConfiguration: Configuration): ConfigLoader[ImageProcessor] = (config: Config, path: String) => {
    val configDetails = parseConfigValue(config.getValue(path), path, moduleConfiguration)
    loadImageProcessor(configDetails)
  }

  private def parseConfigValue(configValue: ConfigValue, path: String, moduleConfiguration: Configuration): ImageProcessorConfigDetails = {
    configValue match {
      case plainClass if plainClass.valueType == ConfigValueType.STRING =>
        ImageProcessorConfigDetails(plainClass.unwrapped.asInstanceOf[String], None, moduleConfiguration,plainClass.origin, path)
      case withConfig:ConfigObject if validConfigObject(withConfig) =>
        val config = withConfig.toConfig
        val className = config.getString("className")
        val processorConfig = config.getConfig("config")
        ImageProcessorConfigDetails(className, Some(Configuration(processorConfig)), moduleConfiguration, withConfig.origin, path)
      case _ =>
        throw new BadValue(configValue.origin, path, s"An image processor can either a class name (string) or object with className (string) and config (object) fields. This ${configValue.valueType} is not valid.")
    }
  }

  private def validConfigObject(configObject: ConfigObject): Boolean = {
    val config = configObject.toConfig
    config.hasPath("className") && config.hasPath("config")
  }

  private def loadImageProcessor(details: ImageProcessorConfigDetails): ImageProcessor = {
    ImageProcessorLoader
      .loadImageProcessor(details.className, details.config.getOrElse(details.moduleConfiguration))
      .getOrElse { error =>
        val configError = s"Unable to instantiate image processor from config: $error"
        logger.error(configError)
        throw new BadValue(details.origin, details.path, configError)
      }
  }

  def loadImageProcessor(className: String, config: Configuration): Either[String, ImageProcessor] = {
    for {
      imageProcessorClass <- loadClass(className)
      imageProcessorInstance <- instantiate(imageProcessorClass, config)
    } yield imageProcessorInstance
  }

  private def loadClass(className: String): Either[String, Class[_]] = catchNonFatal(Class.forName(className)) {
    case _: ClassNotFoundException => s"Unable to find image processor class $className"
    case other =>
      logger.error(s"Error whilst loading $className", other)
      s"Unknown error whilst loading $className, check logs"
  }

  private def instantiate(imageProcessorClass: Class[_], config: Configuration): Either[String, ImageProcessor] = {


    val maybeCompanionObject = Try(imageProcessorClass.getField("MODULE$").get(imageProcessorClass)).toOption
    val maybeNoArgCtor = Try(imageProcessorClass.getDeclaredConstructor()).toOption
    val maybeConfigCtor = Try(imageProcessorClass.getDeclaredConstructor(classOf[Configuration])).toOption
    for {
      instance <- (maybeCompanionObject, maybeNoArgCtor, maybeConfigCtor) match {
        case (Some(companionObject), _, _) => Right(companionObject)
        case (_, _, Some(configCtor)) => Right(configCtor.newInstance(config))
        case (_, Some(noArgCtor), None) => Right(noArgCtor.newInstance())
        case (None, None, None) => Left(s"Unable to find a suitable constructor for ${imageProcessorClass.getCanonicalName}. Must either have a no arg constructor or a constructor taking one argument of type ImageProcessorConfig.")
      }
      castInstance <- try {
        Right(instance.asInstanceOf[ImageProcessor])
      } catch {
        case _: ClassCastException => Left(s"Failed to cast ${imageProcessorClass.getCanonicalName} to an ImageProcessor")
      }
    } yield castInstance
  }

  private def catchNonFatal[T](block: => T)(error: Throwable => String): Either[String, T] = {
    try {
      Right(block)
    } catch {
      case NonFatal(e) => Left(error(e))
    }
  }
}
