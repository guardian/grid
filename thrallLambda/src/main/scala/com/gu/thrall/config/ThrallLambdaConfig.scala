package com.gu.thrall.config

import java.time.temporal.TemporalAmount
import java.time.{Duration, Period}
import java.util.Map
import java.util.concurrent.TimeUnit
import java.{lang, util}

import com.gu.mediaservice.lib.config.CommonConfig
import com.typesafe.config._
import play.api.Configuration

class ThrallLambdaConfig extends CommonConfig {
  override def appName: String = "thrallLambda"

  override def configuration: Configuration = new Configuration(new Config() {
    override def getIntList(path: String): util.List[Integer] = ???

    override def getLongList(path: String): util.List[lang.Long] = ???

    override def resolve(): Config = ???

    override def resolve(options: ConfigResolveOptions): Config = ???

    override def getEnum[T <: Enum[T]](enumClass: Class[T], path: String): T = ???

    override def getMemorySize(path: String): ConfigMemorySize = ???

    override def getTemporal(path: String): TemporalAmount = ???

    override def getBytes(path: String): lang.Long = ???

    override def getMilliseconds(path: String): lang.Long = ???

    override def withValue(path: String, value: ConfigValue): Config = ???

    override def getDuration(path: String, unit: TimeUnit): Long = ???

    override def getDuration(path: String): Duration = ???

    override def getList(path: String): ConfigList = ???

    override def isResolved: Boolean = ???

    override def getAnyRef(path: String): AnyRef = ???

    override def getObjectList(path: String): util.List[_ <: ConfigObject] = ???

    override def atKey(key: String): Config = ???

    override def getNumberList(path: String): util.List[Number] = ???

    override def getObject(path: String): ConfigObject = ???

    override def entrySet(): util.Set[Map.Entry[String, ConfigValue]] = ???

    override def getDoubleList(path: String): util.List[lang.Double] = ???

    override def withOnlyPath(path: String): Config = ???

    override def getInt(path: String): Int = ???

    override def getMemorySizeList(path: String): util.List[ConfigMemorySize] = ???

    override def getNanosecondsList(path: String): util.List[lang.Long] = ???

    override def resolveWith(source: Config): Config = ???

    override def resolveWith(source: Config, options: ConfigResolveOptions): Config = ???

    override def getConfigList(path: String): util.List[_ <: Config] = ???

    override def hasPathOrNull(path: String): Boolean = ???

    override def getStringList(path: String): util.List[String] = ???

    override def getBytesList(path: String): util.List[lang.Long] = ???

    override def getBooleanList(path: String): util.List[lang.Boolean] = ???

    override def checkValid(reference: Config, restrictToPaths: String*): Unit = ???

    override def getMillisecondsList(path: String): util.List[lang.Long] = ???

    override def origin(): ConfigOrigin = ???

    override def getDouble(path: String): Double = ???

    override def getPeriod(path: String): Period = ???

    override def getNumber(path: String): Number = ???

    override def root(): ConfigObject = ???

    override def hasPath(path: String): Boolean = ???

    override def getDurationList(path: String, unit: TimeUnit): util.List[lang.Long] = ???

    override def getDurationList(path: String): util.List[Duration] = ???

    override def getBoolean(path: String): Boolean = ???

    override def getEnumList[T <: Enum[T]](enumClass: Class[T], path: String): util.List[T] = ???

    override def withoutPath(path: String): Config = ???

    override def withFallback(other: ConfigMergeable): Config = ???

    override def isEmpty: Boolean = ???

    override def getString(path: String): String = ???

    override def getConfig(path: String): Config = ???

    override def getLong(path: String): Long = ???

    override def getValue(path: String): ConfigValue = ???

    override def getNanoseconds(path: String): lang.Long = ???

    override def atPath(path: String): Config = ???

    override def getIsNull(path: String): Boolean = ???

    override def getAnyRefList(path: String): util.List[_] = ???
  })
}
