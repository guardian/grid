package lib

import com.amazonaws.services.ec2.AmazonEC2Client
import com.amazonaws.auth.{BasicAWSCredentials, AWSCredentials}
import scalaz.syntax.id._

import com.gu.mediaservice.lib.elasticsearch.EC2._
import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig, CommonPlayAppProperties}


object Config extends CommonPlayAppConfig with CommonPlayAppProperties {

  val properties = Properties.fromPath("/etc/gu/media-api.properties")

  val awsCredentials: AWSCredentials =
    new BasicAWSCredentials(properties("aws.id"), properties("aws.secret"))

  val keyStoreBucket: String = properties("auth.keystore.bucket")

  val ec2Client: AmazonEC2Client =
    new AmazonEC2Client(awsCredentials) <| (_ setEndpoint awsEndpoint)

  val elasticsearchHost: String =
    if (stage == "DEV")
      string("es.host")
    else
      findElasticsearchHost(ec2Client, Map(
        "Stage" -> Seq(stage),
        "Stack" -> Seq(elasticsearchStack),
        "App"   -> Seq(elasticsearchApp)
      ))

  val imageBucket: String = properties("s3.image.bucket")
  val thumbBucket: String = properties("s3.thumb.bucket")

  val topicArn: String = properties("sns.topic.arn")

  // Note: had to make these lazy to avoid init order problems ;_;

  lazy val rootUri: String = services.apiBaseUri
  lazy val kahunaUri: String = services.kahunaBaseUri
  lazy val cropperUri: String = services.cropperBaseUri
  lazy val loaderUri: String = services.loaderBaseUri
  lazy val metadataUri: String = services.metadataBaseUri
  lazy val imgopsUri: String = services.imgopsBaseUri
  lazy val loginUri: String = services.loginUri

  private lazy val corsAllowedOrigins = properties.getOrElse("cors.allowed.origins", "").split(",").toList
  lazy val corsAllAllowedOrigins: List[String] =
    services.kahunaBaseUri :: corsAllowedOrigins

  val requiredMetadata = List("credit", "description")

  // TODO: Review these with RCS et al
  val freeCreditList = List(
    "AAPIMAGE",
    "AFP",
    "ANSA",
    "AP",
    "AP POOL",
    "Action Images",
    "Alamy",
    "Allsport",
    "Allstar Picture Library",
    "Associated Press",
    "BBC",
    "BFI",
    "Community Newswire",
    "Corbis",
    "dpa",
    "EPA",
    "FilmMagic",
    "Hulton Archive",
    "Hulton Getty",
    "IBL/REX",
    "Keystone",
    "NASA Earth Observatory",
    "NPA ROTA", "PA", "PA WIRE",
    "Pool",
    // annoyingly I have seen some REUTER images
    "REUTER", "REUTERS",
    "RONALD GRANT",
    "RTRPIX",
    "Rex Features",
    "Ronald Grant Archive",
    "THE RONALD GRANT ARCHIVE",
    "The Art Archive",
    "WireImage",
    // Getty
    "Getty Images",
    "AFP/Getty Images",
    "Bloomberg via Getty Images",
    "Fairfax Media via Getty Images",
    // FIXME: we've actually settled on "The Guardian" as canonical source.
    // There's now a MetadataCleaner to transform all to The Guardian canonical name.
    // We need to migrate all indexed content with "Guardian" to "The Guardian" before we can
    // retire Guardian from whitelist here.
    "Guardian", "The Guardian", "The Observer")


  val freeSourceList = List(
    "Corbis",
    "Rex Features",
    // Barcroft Media & sons
    "Barcroft Media",
    "Barcroft India",
    "Barcroft USA",
    "Barcroft Cars"
  )

  // Note: we filter exclusively on matching source, rather than combining credit=Getty and source=X
  // this is assumed to be good enough as it's unlikely other provider will use the same source.
  val payGettySourceList = List(
    "ASAblanca",
    "Anadolu",
    "BBC News & Current Affairs",
    // TODO: put back in once we can filter on both
    // supplier/collection, since we have a direct deal with
    // Barcroft. Also, should it be "Barcroft Media"?
    // "Barcroft",
    "Blom UK",
    "Boston Globe",
    "British Athletics",
    "Bundesliga Collection",
    "Caiaimage",
    "Carnegie Museum Art",
    "Catwalking",
    "Champions Hockey League",
    "City-Press",
    "Contour Style",
    "Contour",
    "Country Music Hall of Fame and Museum",
    "Cricket Australia",
    "Denver Post",
    "Edit",
    "Fox Image Collection",
    "French Select",
    "Frontzone Sport",
    "GC Images",
    "Gallo Images Editorial",
    "Gamma Legends",
    "Gamma Rapho",
    "German Select",
    "Getty Images Portrait",
    "Golden Boy Promotions",
    "Her Og Nu",
    "Hero Images",
    "Hulton Royals Collection",
    "IAAF World Athletics",
    "ICC",
    "Imperial War Museums",
    "Interact Images",
    "International Center of Photography",
    "Kommersant",
    "Lichfield Archive",
    "LightRocket",
    "MLB Platinum",
    "Mark Leech Sports Photography",
    "Masters",
    "Moment Editorial",
    "Moment Mobile Editorial",
    "Mondadori Portfolio",
    "NBA Classic",
    "NBCUniversal",
    "NHLPA - Be A Player",
    "Neil Leifer Collection",
    "PB Archive",
    "PGA of America",
    "Papixs",
    "Paris Match Archive",
    "Paris Match Collection",
    "Photothek",
    "Portland Press Herald",
    "Premium Archive",
    "Premium Ent",
    "Rainer Schlegelmilch",
    "Replay Photos",
    "Reportage by Getty Images",
    "Ron Galella Collection",
    "SAMURAI JAPAN",
    "Sports Illustrated Classic",
    "Sports Illustrated",
    "Terry O’Neill",
    "The Asahi Shimbun Premium",
    "The Conlon Collection",
    "The IRB Collection",
    "The LIFE Image Collection",
    "The LIFE Picture Collection",
    "The LIFE Premium Collection",
    "The Ring Magazine",
    "Toronto Star",
    "UEFA.com",
    "UK Press",
    "Ulrich Baumgarten",
    "Universal Images",
    "World Kabbadi League",
    "ullstein bild"
  )

  // TODO: move to config
  val queriableIdentifiers = Seq("picdarUrn")

}
