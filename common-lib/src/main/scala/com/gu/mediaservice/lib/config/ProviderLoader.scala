package com.gu.mediaservice.lib.config

import com.typesafe.config.ConfigException.BadValue
import com.typesafe.config._
import com.typesafe.scalalogging.StrictLogging
import play.api.{ConfigLoader, Configuration}

import java.lang.reflect.{Constructor, InvocationTargetException}
import scala.collection.JavaConverters.asScalaIteratorConverter
import scala.reflect.ClassTag
import scala.util.Try
import scala.util.control.NonFatal

case class ProviderResources[Resources](configuration: Configuration, resources: Resources)

class ProviderLoader[ProviderType, ResourcesType](providerDescription: String)(implicit providerTag: ClassTag[ProviderType], resourcesTag: ClassTag[ResourcesType]) extends StrictLogging {

  private case class ConfigDetails(className: String,
                                   config: Option[Configuration],
                                   resources: ResourcesType,
                                   origin: ConfigOrigin,
                                   path: String)

  def seqConfigLoader(resources: ResourcesType): ConfigLoader[Seq[ProviderType]] = (config: Config, path: String) => {
    config
      .getList(path)
      .iterator()
      .asScala.map { configValue =>
      parseConfigValue(configValue, path, resources)
    }.map(loadProvider).toList
  }

  def singletonConfigLoader(resources: ResourcesType): ConfigLoader[ProviderType] = (config: Config, path: String) => {
    val configDetails = parseConfigValue(config.getValue(path), path, resources)
    loadProvider(configDetails)
  }

  private def parseConfigValue(configValue: ConfigValue, path: String, resources: ResourcesType): ConfigDetails = {
    configValue match {
      case plainClass if plainClass.valueType == ConfigValueType.STRING =>
        ConfigDetails(plainClass.unwrapped.asInstanceOf[String], None, resources, plainClass.origin, path)
      case withConfig:ConfigObject if validConfigObject(withConfig) =>
        val config = withConfig.toConfig
        val className = config.getString("className")
        val processorConfig = config.getConfig("config")
        ConfigDetails(className, Some(Configuration(processorConfig)), resources, withConfig.origin, path)
      case _ =>
        throw new BadValue(configValue.origin, path, s"A ${providerDescription} can either be a class name (string) or object with className (string) and config (object) fields. This ${configValue.valueType} is not valid.")
    }
  }

  private def validConfigObject(configObject: ConfigObject): Boolean = {
    val config = configObject.toConfig
    config.hasPath("className") && config.hasPath("config")
  }

  private def loadProvider(details: ConfigDetails): ProviderType = {
    logger.info(s"Dynamically loading provider from ${details.className} as specified by config path ${details.path}")
    val config = ProviderResources(details.config.getOrElse(Configuration.empty), details.resources)
    loadProvider(details.className, config) match {
      case Right(provider) => provider
      case Left(error) =>
        val configError = s"Unable to instantiate ${providerDescription} from config: $error"
        logger.error(configError)
        throw new BadValue(details.origin, details.path, configError)
    }
  }

  def loadProvider(className: String, config: ProviderResources[ResourcesType]): Either[String, ProviderType] = {
    for {
      imageProcessorClass <- loadClass(className)
      imageProcessorInstance <- instantiate(imageProcessorClass, config)
    } yield imageProcessorInstance
  }

  private def loadClass(className: String): Either[String, Class[_]] = catchNonFatal(Class.forName(className)) {
    case _: ClassNotFoundException => s"Unable to find ${providerDescription} class $className"
    case other =>
      logger.error(s"Error whilst loading $className", other)
      s"Unknown error whilst loading $className, check logs"
  }

  trait ProviderClassType
  case class ProviderCompanionObject(companionObject: AnyRef) extends ProviderClassType
  case class ProviderConstructor(ctor: Constructor[_]) extends ProviderClassType

  private def instantiate(clazz: Class[_], resources: ProviderResources[ResourcesType]): Either[String, ProviderType] = {
    for {
      providerClassType <- discoverProviderClassType(clazz, resources.configuration.keys.nonEmpty)
      instance <- getProviderInstance(providerClassType, resources)
      castInstance <- castProvider(instance)
    } yield castInstance
  }

  private def discoverProviderClassType(clazz: Class[_], configProvided: Boolean): Either[String, ProviderClassType] = {
    Try(clazz.getField("MODULE$").get(clazz)).toOption match {
      case Some(companionObject) if configProvided => Left(s"Configuration provided but ${clazz.getCanonicalName} is a companion object and doesn't take configuration.")
      case Some(companionObject) => Right(ProviderCompanionObject(companionObject))
      case None =>
        for {
          ctor <- findConstructor(clazz, configProvided)
        } yield ProviderConstructor(ctor)
    }
  }

  private def findConstructor(clazz: Class[_], configurationProvided: Boolean): Either[String, Constructor[_]] = {
    /* if config is provided but the constructor doesn't take config then it violates our contract */
    def configViolation(ctor: Constructor[_]): Boolean = {
      val paramTypes = ctor.getParameterTypes.toList
      val hasConfigParam = paramTypes.contains(classOf[Configuration])
      configurationProvided && !hasConfigParam
    }

    // get all constructors
    val allConstructors = clazz.getConstructors.toList
    // get a list of constructors that we know how to use (this should be size one)
    val validConstructors: List[Constructor[_]] = allConstructors.filter(validProviderConstructor)

    validConstructors match {
      case configViolationConstructor :: Nil if configViolation(configViolationConstructor) =>
        Left(s"Configuration provided but constructor of ${clazz.getCanonicalName} with args ${constructorParamsString(configViolationConstructor)} doesn't take it.")
      case singleValidConstructor :: Nil =>
        Right(singleValidConstructor)
      case otherCombinations =>
        Left(s"""A provider must have one and only one valid constructors taking arguments of type
                |${resourcesTag.runtimeClass.getCanonicalName} or ${classOf[Configuration].getCanonicalName}.
                |${clazz.getCanonicalName} has ${otherCombinations.length} constructors:
                |${otherCombinations.map(constructorParamsString)}""".stripMargin)
    }
  }

  private def validProviderConstructor: Constructor[_] => Boolean = { constructor =>
    val paramTypes = constructor.getParameterTypes.toList
    // if the same type appears twice then we don't know what to do
    val noDuplicates = paramTypes.length == paramTypes.toSet.size
    // only pick constructors that take types of resources or config
    val onlyKnownTypes = paramTypes.forall { paramType =>
      paramType == resourcesTag.runtimeClass || paramType == classOf[Configuration]
    }
    noDuplicates && onlyKnownTypes
  }

  private def getProviderInstance(providerType: ProviderClassType, resources: ProviderResources[ResourcesType]): Either[String, ProviderType] = {
    for {
      instance <- providerType match {
        case ProviderCompanionObject(companionObject) => Right(companionObject)
        case ProviderConstructor(ctor) => catchNonFatal(ctor.newInstance(paramsFor(ctor, resources):_*)){
          case ite: InvocationTargetException =>
            val cause = Option(ite.getCause)
            val error = s"${cause.map(_.getClass.getName).getOrElse("Unknown exception")} thrown when executing constructor ${ctor.getClass.getCanonicalName}${constructorParamsString(ctor)}. Search logs for stack trace."
            logger.error(error, cause.getOrElse(ite))
            error
          case NonFatal(other) =>
            val error = s"${other.getClass.getName} thrown whilst creating a new instance using constructor ${ctor.getClass.getCanonicalName}${constructorParamsString(ctor)}. Search logs for stack trace."
            logger.error(error, other)
            error
        }
      }
      castInstance <- castProvider(instance)
    } yield castInstance
  }

  private def paramsFor(ctor: Constructor[_], resources: ProviderResources[ResourcesType]): Array[Object] = {
    val array = new Array[Object](ctor.getParameterCount)

    ctor.getParameters.zipWithIndex.foreach { case (param, index) =>
      if (param.getType == classOf[Configuration]) {
        array(index) = resources.configuration.asInstanceOf[Object]
      } else if (param.getType == resourcesTag.runtimeClass) {
        array(index) = resources.resources.asInstanceOf[Object]
      }
    }

    array
  }

  private def castProvider(instance: Any): Either[String, ProviderType] = {
    if (providerTag.runtimeClass.isAssignableFrom(instance.getClass)) {
      Right(instance.asInstanceOf[ProviderType])
    } else {
      Left(s"Failed to cast ${instance.getClass.getCanonicalName} to a ${providerTag.runtimeClass.getCanonicalName}")
    }
  }

  private def constructorParamsString(ctor: Constructor[_]): String = ctor.getParameterTypes.map(_.getCanonicalName).mkString("(", ", ", ")")

  private def catchNonFatal[T](block: => T)(error: Throwable => String): Either[String, T] = {
    try {
      Right(block)
    } catch {
      case NonFatal(e) => Left(error(e))
    }
  }
}
