package com.gu.mediaservice.model

import com.gu.mediaservice.lib.config.CommonConfig
import com.typesafe.config.Config
import com.typesafe.config.ConfigException.BadValue
import com.typesafe.scalalogging.StrictLogging
import play.api.ConfigLoader
import play.api.libs.json._
import scalaz.NonEmptyList

import scala.jdk.CollectionConverters._
import scala.reflect.runtime.universe
import scala.util.control.NonFatal


sealed trait UsageRights {
  // These two properties are used to infer cost
  // TODO: Remove these as they have nothing to do with the model really
  val restrictions: Option[String]
  val defaultCost: Option[Cost]
}
sealed trait Photographer extends UsageRights
sealed trait Illustrator extends UsageRights

sealed trait UsageRightsSpec {
  val category: String
  def name(config: CommonConfig): String
  def description(config: CommonConfig): String
  val defaultCost: Option[Cost]

  val defaultRestrictions: Option[String] = None
  val caution: Option[String] = None
}

object UsageRightsSpec extends StrictLogging {
  val runtimeMirror: universe.Mirror = universe.runtimeMirror(getClass.getClassLoader)

  implicit val configLoader: ConfigLoader[Seq[UsageRightsSpec]] = (rootConfig: Config, path: String) => {
    rootConfig.getStringList(path).iterator().asScala.map { className =>
      try {
        val module = runtimeMirror.staticModule(className)
        val obj = runtimeMirror.reflectModule(module)
        obj.instance.asInstanceOf[UsageRightsSpec]
      } catch {
        case NonFatal(error) =>
          val message = s"Unable to instantiate $className from config: $error"
          logger.error(message)
          throw new BadValue(path, message, error)
      }
    }.toSeq
  }
}

object UsageRights {

  val photographer: NonEmptyList[UsageRightsSpec] = NonEmptyList(StaffPhotographer, ContractPhotographer, CommissionedPhotographer)
  val illustrator: NonEmptyList[UsageRightsSpec] = NonEmptyList(StaffIllustrator, ContractIllustrator, CommissionedIllustrator)
  val whollyOwned: NonEmptyList[UsageRightsSpec] = photographer append illustrator

  // this is a convenience method so that we use the same formatting for all subtypes
  // i.e. use the standard `Json.writes`. I still can't find a not have to pass the `f:Format[T]`
  // explicitly and inferring the type, but I think that has to do with the reflection that's used
  // in the serialisation.
  def subtypeFormat[T <: UsageRights](category: String)(f: Format[T]): Format[T] = {
    val writes = Writes[T] { u =>
      Json.obj("category" -> category) ++ f.writes(u).as[JsObject]
    }
    val reads = Reads[T](f.reads)

    Format[T](reads, writes)
  }

  // When using `Json.as[UsageRights]` or `Json.toJson(usageRights)` we want to
  // make sure we right the correct subtype parser. This allows us to retain any
  // additional fields to the case classes (like "photographer" on
  // `StaffPhotographer`), or, as in the case of `NoRights`, create a custom parser
  // all together.
  // TODO: I haven't figured out why Json.toJson[T](o) doesn't work here, it'd
  // be good to know though.
  implicit def jsonWrites[T <: UsageRights]: Writes[T] = Writes[T] {
    case o: Chargeable => Chargeable.formats.writes(o)
    case o: Agency => Agency.formats.writes(o)
    case o: CommissionedAgency => CommissionedAgency.formats.writes(o)
    case o: PrImage => PrImage.formats.writes(o)
    case o: Handout => Handout.formats.writes(o)
    case o: Screengrab => Screengrab.formats.writes(o)
    case o: GuardianWitness => GuardianWitness.formats.writes(o)
    case o: OriginalSource => OriginalSource.formats.writes(o)
    case o: SocialMedia => SocialMedia.formats.writes(o)
    case o: Bylines => Bylines.formats.writes(o)
    case o: Obituary => Obituary.formats.writes(o)
    case o: StaffPhotographer => StaffPhotographer.formats.writes(o)
    case o: ContractPhotographer => ContractPhotographer.formats.writes(o)
    case o: CommissionedPhotographer => CommissionedPhotographer.formats.writes(o)
    case o: Pool => Pool.formats.writes(o)
    case o: CrownCopyright => CrownCopyright.formats.writes(o)
    case o: ContractIllustrator => ContractIllustrator.formats.writes(o)
    case o: StaffIllustrator => StaffIllustrator.formats.writes(o)
    case o: CommissionedIllustrator => CommissionedIllustrator.formats.writes(o)
    case o: CreativeCommons => CreativeCommons.formats.writes(o)
    case o: Composite => Composite.formats.writes(o)
    case o: PublicDomain => PublicDomain.formats.writes(o)
    case o: ProgramPromotional => ProgramPromotional.formats.writes(o)
    case o: ProgrammesOrganisationOwned => ProgrammesOrganisationOwned.formats.writes(o)
    case o: ProgrammesAcquisitions => ProgrammesAcquisitions.formats.writes(o)
    case o: ProgrammesIndependents => ProgrammesIndependents.formats.writes(o)
    case o: NoRights.type => NoRights.jsonWrites.writes(o)
  }

  implicit val jsonReads: Reads[UsageRights] = Reads[UsageRights] { json =>
      val category = (json \ "category").asOpt[String]

      // We use supplier as an indicator that an image is an Agency
      // image as some images have been indexed without a category.
      // TODO: Fix with reindex
      val supplier = (json \ "supplier").asOpt[String]

      (category flatMap {
        case Chargeable.category => json.asOpt[Chargeable]
        case Agency.category => json.asOpt[Agency]
        case CommissionedAgency.category => json.asOpt[CommissionedAgency]
        case PrImage.category => json.asOpt[PrImage]
        case Handout.category => json.asOpt[Handout]
        case Screengrab.category => json.asOpt[Screengrab]
        case GuardianWitness.category => json.asOpt[GuardianWitness]
        case OriginalSource.category => json.asOpt[OriginalSource]
        case SocialMedia.category => json.asOpt[SocialMedia]
        case Bylines.category => json.asOpt[Bylines]
        case Obituary.category => json.asOpt[Obituary]
        case StaffPhotographer.category => json.asOpt[StaffPhotographer]
        case ContractPhotographer.category => json.asOpt[ContractPhotographer]
        case CommissionedPhotographer.category => json.asOpt[CommissionedPhotographer]
        case Pool.category => json.asOpt[Pool]
        case CrownCopyright.category => json.asOpt[CrownCopyright]
        case ContractIllustrator.category => json.asOpt[ContractIllustrator]
        case StaffIllustrator.category => json.asOpt[StaffIllustrator]
        case CommissionedIllustrator.category => json.asOpt[CommissionedIllustrator]
        case CreativeCommons.category => json.asOpt[CreativeCommons]
        case Composite.category => json.asOpt[Composite]
        case PublicDomain.category => json.asOpt[PublicDomain]
        case ProgramPromotional.category => json.asOpt[ProgramPromotional]
        case ProgrammesOrganisationOwned.category => json.asOpt[ProgrammesOrganisationOwned]
        case ProgrammesAcquisitions.category => json.asOpt[ProgrammesAcquisitions]
        case ProgrammesIndependents.category => json.asOpt[ProgrammesIndependents]
        case _ => None
      })
        .orElse(supplier.flatMap(_ => json.asOpt[Agency]))
        .orElse(json.asOpt[NoRights.type])
        .map(JsSuccess(_))
        .getOrElse(JsError(s"No such usage rights category: ${category.getOrElse("None")}"))
    }
}

// We have a custom writes and reads for NoRights as it is represented by `{}`
// in the DB layer.
case object NoRights
  extends UsageRights with UsageRightsSpec {
  val category = ""
  val defaultCost = None
  val restrictions = None
  def name(commonConfig: CommonConfig) = "No Rights"
  def description(commonConfig: CommonConfig) =
    "Images which we do not currently have the rights to use."

  override val caution =
    Some("You cannot use this image in content!")

  lazy val jsonVal = Json.obj()

  implicit val jsonReads: Reads[NoRights.type] = Reads[NoRights.type] { json =>
    if (json == jsonVal) JsSuccess(NoRights) else JsError("Value should be {} for no rights")
  }
  implicit val jsonWrites: Writes[NoRights.type] = Writes[NoRights.type](_ => jsonVal)
}


final case class Chargeable(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Chargeable.defaultCost
}
object Chargeable extends UsageRightsSpec {
  val category = "chargeable"
  val defaultCost = Some(Pay)
  def name(commonConfig: CommonConfig) = "Chargeable supplied / on spec"
  def description(commonConfig: CommonConfig) =
    s"Images acquired by or supplied that do not fit other categories in ${commonConfig.systemName} and " +
      "therefore fees will be payable per use. Unless negotiated otherwise, fees should be based on " +
      s"standard published rates for stock and speculative images."

  implicit val formats: Format[Chargeable] =
    UsageRights.subtypeFormat(Chargeable.category)(Json.format[Chargeable])
}

object Agencies {
  val all = Map(
    "getty" -> Agency("Getty Images"),
    "rex" -> Agency("Rex Features"),
    "aap" -> Agency("AAP"),
    "alamy" -> Agency("Alamy")
  )

  def get(id: String) = all.getOrElse(id, Agency(id))

  def lookupId(lookupSupplierName: String): Option[String] = all.collectFirst {
    case (id, Agency(supplierName, _, _)) if lookupSupplierName == supplierName => { id }
  }

  def getWithCollection(id: String, suppliersCollection: Option[String]) =
    all.get(id)
      .map(_.copy(suppliersCollection = suppliersCollection))
      .getOrElse(Agency(id, suppliersCollection))
}

final case class Agency(supplier: String, suppliersCollection: Option[String] = None,
                        restrictions: Option[String] = None) extends UsageRights  {
  val defaultCost = Agency.defaultCost
  def id: Option[String] = Agencies.lookupId(supplier)
}
object Agency extends UsageRightsSpec {
  val category = "agency"
  val defaultCost = None
  def name(commonConfig: CommonConfig) = "Agency - subscription"
  def description(commonConfig: CommonConfig) =
    "Agencies such as Reuters, Press Association, etc. where subscription fees are paid to access and use pictures."

  implicit val formats: Format[Agency] =
    UsageRights.subtypeFormat(Agency.category)(Json.format[Agency])
}


final case class CommissionedAgency(supplier: String, restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = CommissionedAgency.defaultCost
}
object CommissionedAgency extends UsageRightsSpec {
  val category = "commissioned-agency"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Agency - commissioned"
  def description(commonConfig: CommonConfig) = "Images commissioned from agencies on an ad hoc basis."

  implicit val formats: Format[CommissionedAgency] =
    UsageRights.subtypeFormat(CommissionedAgency.category)(Json.format[CommissionedAgency])
}


final case class PrImage(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = PrImage.defaultCost
}
object PrImage extends UsageRightsSpec {
  val category = "PR Image"
  val defaultCost = Some(Conditional)
  def name(commonConfig: CommonConfig) = "PR Image"
  def description(commonConfig: CommonConfig) =
    "Images supplied for publicity purposes such as press launches, charity events, travel, " +
      "promotional images, etc."

  override val caution =
    Some("For use only within the context originally provided for (please state it below).")

  implicit val formats: Format[PrImage] =
    UsageRights.subtypeFormat(PrImage.category)(Json.format[PrImage])
}


final case class Handout(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Handout.defaultCost
}
object Handout extends UsageRightsSpec {
  val category = "handout"
  val defaultCost = Some(Conditional)
  def name(commonConfig: CommonConfig) = "Handout"
  def description(commonConfig: CommonConfig) =
    "Images supplied on general release to all media e.g. images provided by police for new " +
      "stories, family shots in biographical pieces, etc."

  override val caution =
    Some("For use only within the context originally provided for (please state it below).")

  implicit val formats: Format[Handout] =
    UsageRights.subtypeFormat(Handout.category)(Json.format[Handout])
}


// TODO: `source` should not be an Option, but because we added it later, we would need to backfill
// the data
final case class Screengrab(source: Option[String], restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Screengrab.defaultCost
}
object Screengrab extends UsageRightsSpec {
  val category = "screengrab"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Screengrab"
  def description(commonConfig: CommonConfig) =
    s"Stills created by ${commonConfig.staffPhotographerOrganisation} from moving footage in television broadcasts usually in relation to " +
      "breaking news stories."

  implicit val formats: Format[Screengrab] =
    UsageRights.subtypeFormat(Screengrab.category)(Json.format[Screengrab])
}


final case class GuardianWitness(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = GuardianWitness.defaultCost
}
object GuardianWitness extends UsageRightsSpec {
  val category = "guardian-witness"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "GuardianWitness"
  def description(commonConfig: CommonConfig) =
    "Images provided by readers in response to callouts and assignments on GuardianWitness."

  implicit val formats: Format[GuardianWitness] =
    UsageRights.subtypeFormat(GuardianWitness.category)(Json.format[GuardianWitness])
}

final case class OriginalSource(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = OriginalSource.defaultCost
}
object OriginalSource extends UsageRightsSpec {
  val category = "original-source"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Original Source"
  def description(commonConfig: CommonConfig) =
    "Images provided by members of the public to be shared with a journalist who is out collecting material for stories."

  implicit val formats: Format[OriginalSource] =
    UsageRights.subtypeFormat(OriginalSource.category)(Json.format[OriginalSource])
}


final case class SocialMedia(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = SocialMedia.defaultCost
}
object SocialMedia extends UsageRightsSpec {
  val category = "social-media"
  val defaultCost = Some(Conditional)
  def name(commonConfig: CommonConfig) = "Social Media"
  def description(commonConfig: CommonConfig) =
    "Images grabbed from social media to support breaking news where no other image is available " +
      "from usual sources."

  override val caution =
    Some("Approval needed from senior editor if permission from owner cannot be acquired")

  implicit val formats: Format[SocialMedia] =
    UsageRights.subtypeFormat(SocialMedia.category)(Json.format[SocialMedia])
}

final case class Bylines(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Bylines.defaultCost
}
object Bylines extends UsageRightsSpec {
  val category = "Bylines"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Bylines"
  def description(commonConfig: CommonConfig) =
    "Images acquired from private sources, for the purposes of bylines"

  implicit val formats: Format[Bylines] =
    UsageRights.subtypeFormat(Bylines.category)(Json.format[Bylines])
}

final case class Obituary(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Obituary.defaultCost
}
object Obituary extends UsageRightsSpec {
  val category = "obituary"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Obituary"
  def description(commonConfig: CommonConfig) =
    "Images acquired from private sources, e.g. family members, for the purposes of obituaries."

  implicit val formats: Format[Obituary] =
    UsageRights.subtypeFormat(Obituary.category)(Json.format[Obituary])
}


final case class StaffPhotographer(photographer: String, publication: String,
                             restrictions: Option[String] = None) extends Photographer {
  val defaultCost = StaffPhotographer.defaultCost
}
object StaffPhotographer extends UsageRightsSpec {
  val category = "staff-photographer"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Photographer - staff"
  def description(commonConfig: CommonConfig) =
    "Images from photographers who are or were members of staff."

  implicit val formats: Format[StaffPhotographer] =
    UsageRights.subtypeFormat(StaffPhotographer.category)(Json.format[StaffPhotographer])
}


final case class ContractPhotographer(photographer: String, publication: Option[String] = None,
                                restrictions: Option[String] = None) extends Photographer {
  val defaultCost = ContractPhotographer.defaultCost
}
object ContractPhotographer extends UsageRightsSpec {
  val category = "contract-photographer"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Photographer - contract"
  def description(commonConfig: CommonConfig) =
    "Images from freelance photographers on fixed-term contracts."

  implicit val formats: Format[ContractPhotographer] =
    UsageRights.subtypeFormat(ContractPhotographer.category)(Json.format[ContractPhotographer])
}


final case class CommissionedPhotographer(photographer: String, publication: Option[String] = None,
                                    restrictions: Option[String] = None) extends Photographer {
  val defaultCost = CommissionedPhotographer.defaultCost
}
object CommissionedPhotographer extends UsageRightsSpec {
  val category = "commissioned-photographer"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Photographer - commissioned"
  def description(commonConfig: CommonConfig) =
    "Images commissioned from freelance photographers on an ad hoc basis."

  implicit val formats: Format[CommissionedPhotographer] =
    UsageRights.subtypeFormat(CommissionedPhotographer.category)(Json.format[CommissionedPhotographer])
}


final case class Pool(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Pool.defaultCost
}
object Pool extends UsageRightsSpec {
  val category = "pool"
  val defaultCost = Some(Conditional)
  def name(commonConfig: CommonConfig) = "Pool"
  def description(commonConfig: CommonConfig) =
    "Images issued during major national events that are free to use and shared amongst news " +
      "media organisations. Rights revert to the copyright holder when the pool is terminated."

  implicit val formats: Format[Pool] =
    UsageRights.subtypeFormat(Pool.category)(Json.format[Pool])
}


final case class CrownCopyright(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = CrownCopyright.defaultCost
}
object CrownCopyright extends UsageRightsSpec {
  val category = "crown-copyright"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Crown copyright"
  def description(commonConfig: CommonConfig) =
    "Crown copyright covers material created by Government. Material may be used subject to " +
      "acknowledgement."

  implicit val formats: Format[CrownCopyright] =
    UsageRights.subtypeFormat(CrownCopyright.category)(Json.format[CrownCopyright])
}

final case class StaffIllustrator(creator: String, restrictions: Option[String] = None)
  extends Illustrator {
  val defaultCost = StaffIllustrator.defaultCost
}
object StaffIllustrator extends UsageRightsSpec {
  val category = "staff-illustrator"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Illustrator - staff"
  def description(commonConfig: CommonConfig) =
    "Images from illustrators who are or were members of staff."

  implicit val formats: Format[StaffIllustrator] =
    UsageRights.subtypeFormat(StaffIllustrator.category)(Json.format[StaffIllustrator])
}

final case class ContractIllustrator(creator: String, publication: Option[String] = None, restrictions: Option[String] = None)
  extends Illustrator {
  val defaultCost = ContractIllustrator.defaultCost
}
object ContractIllustrator extends UsageRightsSpec {
  val category = "contract-illustrator"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Illustrator - contract"
  def description(commonConfig: CommonConfig) =
    "Illustrations from freelance illustrators on fixed-term contracts."

  implicit val formats: Format[ContractIllustrator] =
    UsageRights.subtypeFormat(ContractIllustrator.category)(Json.format[ContractIllustrator])
}

final case class CommissionedIllustrator(creator: String, publication: Option[String] = None, restrictions: Option[String] = None)
  extends Illustrator {
  val defaultCost = CommissionedIllustrator.defaultCost
}
object CommissionedIllustrator extends UsageRightsSpec {
  val category = "commissioned-illustrator"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Illustrator - commissioned"
  def description(commonConfig: CommonConfig) =
    "Illustrations commissioned from freelance illustrators on an ad hoc basis."

  implicit val formats: Format[CommissionedIllustrator] =
    UsageRights.subtypeFormat(CommissionedIllustrator.category)(Json.format[CommissionedIllustrator])
}


final case class CreativeCommons(licence: String, source: String, creator: String, contentLink: String,
                           restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = CreativeCommons.defaultCost
}
object CreativeCommons extends UsageRightsSpec {
  val category = "creative-commons"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Creative Commons"
  def description(commonConfig: CommonConfig) =
    "Images made available by rights holders on open licence terms that grant third parties " +
      "permission to use and share copyright material for free."

  override val caution = Some("This only applies to COMMERCIAL creative commons licences.")

  implicit val formats: Format[CreativeCommons] =
    UsageRights.subtypeFormat(CreativeCommons.category)(Json.format[CreativeCommons])
}


final case class Composite(suppliers: String, restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Composite.defaultCost
}
object Composite extends UsageRightsSpec {
  val category = "composite"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Composite"
  def description(commonConfig: CommonConfig) =
    "A composite is an image made from the combination of a variety of stills. Any images within the composite must be listed within the suppliers field."

  override val caution = Some("All images should be free to use, or restrictions applied")

  implicit val formats: Format[Composite] =
    UsageRights.subtypeFormat(Composite.category)(Json.format[Composite])
}

final case class PublicDomain(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = PublicDomain.defaultCost
}
object PublicDomain extends UsageRightsSpec {
  val category = "public-domain"
  val defaultCost = Some(Free)
  def name(commonConfig: CommonConfig) = "Public Domain"
  def description(commonConfig: CommonConfig) =
    "Images out of copyright or bequeathed to the public."

  override val caution = Some("ONLY use if you are certain the image is out of copyright or bequeathed to public")

  implicit val formats: Format[PublicDomain] =
    UsageRights.subtypeFormat(PublicDomain.category)(Json.format[PublicDomain])
}

final case class ProgramPromotional(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = ProgramPromotional.defaultCost
}
object ProgramPromotional extends UsageRightsSpec {
  val category = "program-promotional"
  val defaultCost = Some(Pay)
  def name(commonConfig: CommonConfig) = "Programme Promotional"
  def description(commonConfig: CommonConfig) =
    "Images supplied for the promotion of public broadcast programmes."

  implicit val formats: Format[ProgramPromotional] =
    UsageRights.subtypeFormat(ProgramPromotional.category)(Json.format[ProgramPromotional])
}

final case class ProgrammesOrganisationOwned(restrictions: Option[String] = None) extends UsageRights {
  override val defaultCost: Option[Cost] = ProgrammesOrganisationOwned.defaultCost
}
object ProgrammesOrganisationOwned extends UsageRightsSpec {
  override val category: String = "programmes-organisation-owned"
  override def name(commonConfig: CommonConfig): String = s"Programmes - ${commonConfig.staffPhotographerOrganisation} Owned"
  override val defaultCost = Some(Free)

  override def description(config: CommonConfig): String = config.usageRightsConfig.programmesOrganisationOwnedConfig match {
    case Some(cfg) if cfg.description.nonEmpty => cfg.description.get
    case _ => "Images related to a programme and the credit belongs to the organisation."
  }

  implicit val formats: Format[ProgrammesOrganisationOwned] =
    UsageRights.subtypeFormat(ProgrammesOrganisationOwned.category)(Json.format[ProgrammesOrganisationOwned])
}

final case class ProgrammesIndependents(independentType: String,
                                        productionCompany: String,
                                        restrictions: Option[String] = None) extends UsageRights {
  override val defaultCost: Option[Cost] = ProgrammesIndependents.defaultCost
}
object ProgrammesIndependents extends UsageRightsSpec {
  override val category: String = "programmes-independents"
  def name(commonConfig: CommonConfig) = "Programmes - Independents"

  override def description(config: CommonConfig): String = config.usageRightsConfig.programmesIndependentsConfig match {
    case Some(cfg) if cfg.description.nonEmpty => cfg.description.get
    case _ => "Images related to a programme made by an independent production company."
  }

  override val defaultCost: Option[Cost] = Some(Free)

  implicit val formats: Format[ProgrammesIndependents] =
    UsageRights.subtypeFormat(ProgrammesIndependents.category)(Json.format[ProgrammesIndependents])
}

final case class ProgrammesAcquisitions(productionCompany: String,  restrictions: Option[String] = None) extends UsageRights {
  override val defaultCost: Option[Cost] = ProgrammesAcquisitions.defaultCost
}
object ProgrammesAcquisitions extends UsageRightsSpec {
  override val category: String = "programmes-acquisitions"
  def name(commonConfig: CommonConfig) = "Programmes - Acquisitions"

  override def description(config: CommonConfig): String = config.usageRightsConfig.programmesAcquisitionsConfig match {
    case Some(cfg) if cfg.description.nonEmpty => cfg.description.get
    case _ => "Images related to a programme that has been bought by the organisation for a period of time."
  }

  override val defaultCost: Option[Cost] = Some(Free)

  implicit val formats: Format[ProgrammesAcquisitions] =
    UsageRights.subtypeFormat(ProgrammesAcquisitions.category)(Json.format[ProgrammesAcquisitions])
}
