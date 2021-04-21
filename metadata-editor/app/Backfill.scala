import java.io.File
import java.net.URL
import java.time.{Duration, Period}
import java.time.temporal.TemporalAmount
import java.{lang, util}
import java.util.Map
import java.util.concurrent.TimeUnit

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.config.GridConfigResources
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.SyndicationRights
import com.typesafe.config.{Config, ConfigList, ConfigMemorySize, ConfigMergeable, ConfigObject, ConfigOrigin, ConfigRenderOptions, ConfigResolveOptions, ConfigValue, ConfigValueType}
import lib.{EditsConfig, Syndication, SyndicationStore}
import play.api.Configuration
import play.api.libs.json.Json

import scala.language.postfixOps
import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.DurationInt
import scala.io.Source
import play.api.libs.json.JsObject

object BackfillApp extends App with Syndication with GridLogging {

  if (args.length == 0) {
    println("dude, i need at least one parameter")
  }
  val dirName = args(0)

  val syndicationTable = "media-service-PROD-SyndicationDynamoTable-6ZBQ3XVSD50I"
//  val syndicationTable = "media-service-TEST-SyndicationDynamoTable-1POLCOD07Q8H3"

  implicit private val system: ActorSystem = ActorSystem()
  def underlying = new Underlying(syndicationTable)
  def configuration = new Configuration(underlying)
  def gridConfigResources = new GridConfigResources(configuration, system)
  def editsConfig = new EditsConfig(gridConfigResources)
  override def syndicationStore = new SyndicationStore(editsConfig)
  override def config = new EditsConfig(gridConfigResources)
  override def editsStore = ???
  override def notifications = ???

  val inputFiles = new File(dirName)
    .listFiles
    .filter(_.isFile)
    .filter(_.getName.startsWith("rights."))
    .filterNot(_.getName.endsWith(".done"))
    .toList
  for (inputFile <- inputFiles) {
    val mapOfIdsAndRights = Json.parse(Source.fromFile(inputFile).mkString).as[JsObject].fields.toList.map { kv =>
      val (id, value) = kv
      id -> (value \ "data").as[SyndicationRights]
    }.toMap
    println(s"File $inputFile gave ${mapOfIdsAndRights.size} records")
    mapOfIdsAndRights.foreach { case (id, rights) =>
      val result = Await.ready(
        setSyndicationOnly(id, rights),
        60 seconds
      )
      println(s"$id gave $result")
    }
    inputFile.renameTo(new File(inputFile.getCanonicalPath + ".done"))
    println(s"File $inputFile done and renamed.")
  }
  system.terminate()
}

class Underlying(syndicationTable: String) extends Config {
  val params = List(
    "grid.stage" -> "LOCAL",
    "grid.appName" -> "Backfill",
    "thrall.kinesis.stream.name" -> "",
    "thrall.kinesis.lowPriorityStream.name" -> "",
    "domain.root" -> "",
    "aws.region" -> "eu-west-1",
    "s3.collections.bucket" -> "",
    "dynamo.table.edits" -> "",
    "dynamo.globalsecondaryindex.edits.photoshoots" -> "",
    "dynamo.table.syndication" -> syndicationTable,
    "indexed.images.sqs.queue.url" -> ""
  ).toMap
  override def root(): ConfigObject = ???

  override def origin(): ConfigOrigin = ???

  override def withFallback(other: ConfigMergeable): Config = ???

  override def resolve(): Config = ???

  override def resolve(options: ConfigResolveOptions): Config = ???

  override def isResolved: Boolean = ???

  override def resolveWith(source: Config): Config = ???

  override def resolveWith(source: Config, options: ConfigResolveOptions): Config = ???

  override def checkValid(reference: Config, restrictToPaths: String*): Unit = ???

  override def hasPath(path: String): Boolean = params.keySet.contains(path)

  override def hasPathOrNull(path: String): Boolean = ???

  override def isEmpty: Boolean = ???

  override def entrySet(): util.Set[Map.Entry[String, ConfigValue]] = ???

  override def getIsNull(path: String): Boolean = ???

  override def getBoolean(path: String): Boolean = ???

  override def getNumber(path: String): Number = ???

  override def getInt(path: String): Int = ???

  override def getLong(path: String): Long = ???

  override def getDouble(path: String): Double = ???

  override def getString(path: String): String = params.get(path).orElse(throw new RuntimeException(s"No param at $path")).get

  override def getEnum[T <: Enum[T]](enumClass: Class[T], path: String): T = ???

  override def getObject(path: String): ConfigObject = ???

  override def getConfig(path: String): Config = ???

  override def getAnyRef(path: String): AnyRef = ???

  override def getValue(path: String): ConfigValue = BackfillConfigValue(path, params.get(path))

  override def getBytes(path: String): lang.Long = ???

  override def getMemorySize(path: String): ConfigMemorySize = ???

  override def getMilliseconds(path: String): lang.Long = ???

  override def getNanoseconds(path: String): lang.Long = ???

  override def getDuration(path: String, unit: TimeUnit): Long = ???

  override def getDuration(path: String): Duration = ???

  override def getPeriod(path: String): Period = ???

  override def getTemporal(path: String): TemporalAmount = ???

  override def getList(path: String): ConfigList = ???

  override def getBooleanList(path: String): util.List[lang.Boolean] = ???

  override def getNumberList(path: String): util.List[Number] = ???

  override def getIntList(path: String): util.List[Integer] = ???

  override def getLongList(path: String): util.List[lang.Long] = ???

  override def getDoubleList(path: String): util.List[lang.Double] = ???

  override def getStringList(path: String): util.List[String] = ???

  override def getEnumList[T <: Enum[T]](enumClass: Class[T], path: String): util.List[T] = ???

  override def getObjectList(path: String): util.List[_ <: ConfigObject] = ???

  override def getConfigList(path: String): util.List[_ <: Config] = new java.util.ArrayList[Config]()

  override def getAnyRefList(path: String): util.List[_] = ???

  override def getBytesList(path: String): util.List[lang.Long] = ???

  override def getMemorySizeList(path: String): util.List[ConfigMemorySize] = ???

  override def getMillisecondsList(path: String): util.List[lang.Long] = ???

  override def getNanosecondsList(path: String): util.List[lang.Long] = ???

  override def getDurationList(path: String, unit: TimeUnit): util.List[lang.Long] = ???

  override def getDurationList(path: String): util.List[Duration] = ???

  override def withOnlyPath(path: String): Config = ???

  override def withoutPath(path: String): Config = ???

  override def atPath(path: String): Config = ???

  override def atKey(key: String): Config = ???

  override def withValue(path: String, value: ConfigValue): Config = ???
}

case class BackfillConfigValue(path: String, value: Option[String]) extends ConfigValue {
  override def origin(): ConfigOrigin = BackfillConfigOrigin(path)

  override def valueType(): ConfigValueType = ???

  override def unwrapped(): AnyRef = ???

  override def render(): String = ???

  override def render(options: ConfigRenderOptions): String = ???

  override def withFallback(other: ConfigMergeable): ConfigValue = ???

  override def atPath(path: String): Config = ???

  override def atKey(key: String): Config = ???

  override def withOrigin(origin: ConfigOrigin): ConfigValue = ???
}

case class BackfillConfigOrigin(path: String) extends ConfigOrigin {
  override def description(): String = path

  override def filename(): String = ""

  override def url(): URL = new URL("http://example.com")

  override def resource(): String = ???

  override def lineNumber(): Int = 0

  override def comments(): util.List[String] = ???

  override def withComments(comments: util.List[String]): ConfigOrigin = ???

  override def withLineNumber(lineNumber: Int): ConfigOrigin = ???
}
