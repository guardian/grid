package com.gu.mediaservice.model

import play.api.libs.json._

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
  val name: String
  val description: String
  val defaultCost: Option[Cost]

  val defaultRestrictions: Option[String] = None
  val caution: Option[String] = None
}

object UsageRights {
  val all = List(
    NoRights, Handout, PrImage, Screengrab, SocialMedia,
    Agency, CommissionedAgency, Chargeable,
    StaffPhotographer, ContractPhotographer, CommissionedPhotographer,
    CreativeCommons, GuardianWitness, Pool, CrownCopyright, Obituary,
    ContractIllustrator, CommissionedIllustrator, StaffIllustrator,
    Composite, PublicDomain
  )

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
    case o: SocialMedia => SocialMedia.formats.writes(o)
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
        case SocialMedia.category => json.asOpt[SocialMedia]
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
  val name = "No Rights"
  val description =
    "Images for which we do not have the rights to use."

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
  val name = "Chargeable supplied / on spec"
  val description =
    "Images acquired by or supplied to GNM that do not fit other categories in the Grid and " +
      "therefore fees will be payable per use. Unless negotiated otherwise, fees should be based on " +
      "standard published GNM rates for stock and speculative images."

  implicit val formats: Format[Chargeable] =
    UsageRights.subtypeFormat(Chargeable.category)(Json.format[Chargeable])
}

final case class Agency(supplier: String, suppliersCollection: Option[String] = None,
                        restrictions: Option[String] = None) extends UsageRights  {
  val defaultCost = Agency.defaultCost
}
object Agency extends UsageRightsSpec {
  val category = "agency"
  val defaultCost = None
  val name = "Agency - subscription"
  val description =
    "Agencies such as Getty, Reuters, Press Association, etc. where subscription fees are paid " +
      "to access and use pictures."

  implicit val formats: Format[Agency] =
    UsageRights.subtypeFormat(Agency.category)(Json.format[Agency])
}


final case class CommissionedAgency(supplier: String, restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = CommissionedAgency.defaultCost
}
object CommissionedAgency extends UsageRightsSpec {
  val category = "commissioned-agency"
  val defaultCost = Some(Free)
  val name = "Agency - commissioned"
  val description =
    "Images commissioned from agencies on an ad hoc basis."

  implicit val formats: Format[CommissionedAgency] =
    UsageRights.subtypeFormat(CommissionedAgency.category)(Json.format[CommissionedAgency])
}


final case class PrImage(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = PrImage.defaultCost
}
object PrImage extends UsageRightsSpec {
  val category = "PR Image"
  val defaultCost = Some(Free)
  val name = "PR Image"
  val description =
    "Images supplied for publicity purposes such as press launches, charity events, travel, " +
      "promotional images, etc."

  implicit val formats: Format[PrImage] =
    UsageRights.subtypeFormat(PrImage.category)(Json.format[PrImage])
}


final case class Handout(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Handout.defaultCost
}
object Handout extends UsageRightsSpec {
  val category = "handout"
  val defaultCost = Some(Free)
  val name = "Handout"
  val description =
    "Images supplied on general release to all media e.g. images provided by police for new " +
      "stories, family shots in biographical pieces, etc."

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
  val name = "Screengrab"
  val description =
    "Stills created by GNM from moving footage in television broadcasts usually in relation to " +
      "breaking news stories."

  implicit val formats: Format[Screengrab] =
    UsageRights.subtypeFormat(Screengrab.category)(Json.format[Screengrab])
}


final case class GuardianWitness(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = GuardianWitness.defaultCost
}
object GuardianWitness extends UsageRightsSpec {
  val category = "guardian-witness"
  val defaultCost = Some(Conditional)
  val name = "GuardianWitness"
  val description =
    "Images provided by readers in response to callouts and assignments on GuardianWitness."

  override val defaultRestrictions = Some(
    "Contact the GuardianWitness desk before use (witness.editorial@theguardian.com)!"
  )

  implicit val formats: Format[GuardianWitness] =
    UsageRights.subtypeFormat(GuardianWitness.category)(Json.format[GuardianWitness])
}


final case class SocialMedia(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = SocialMedia.defaultCost
}
object SocialMedia extends UsageRightsSpec {
  val category = "social-media"
  val defaultCost = Some(Conditional)
  val name = "Social Media"
  val description =
    "Images grabbed from social media to support breaking news where no other image is available " +
      "from usual sources."

  override val caution =
    Some("Approval needed from senior editor if permission from owner cannot be acquired")

  implicit val formats: Format[SocialMedia] =
    UsageRights.subtypeFormat(SocialMedia.category)(Json.format[SocialMedia])
}


final case class Obituary(restrictions: Option[String] = None) extends UsageRights {
  val defaultCost = Obituary.defaultCost
}
object Obituary extends UsageRightsSpec {
  val category = "obituary"
  val defaultCost = Some(Conditional)
  val name = "Obituary"
  val description =
    "Images acquired from private sources, e.g. family members, for the purposes of obituaries."

  override val defaultRestrictions = Some(
    "Only to be used in context with person's obituary"
  )
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
  val name = "Photographer - staff"
  val description =
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
  val name = "Photographer - contract"
  val description =
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
  val name = "Photographer - commissioned"
  val description =
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
  val name = "Pool"
  val description =
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
  val name = "Crown copyright"
  val description =
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
  val name = "Illustrator - staff"
  val description =
    "Images from illustrators who are or were members of staff."

  implicit val formats: Format[StaffIllustrator] =
    UsageRights.subtypeFormat(StaffIllustrator.category)(Json.format[StaffIllustrator])
}

final case class ContractIllustrator(creator: String, restrictions: Option[String] = None)
  extends Illustrator {
  val defaultCost = ContractIllustrator.defaultCost
}
object ContractIllustrator extends UsageRightsSpec {
  val category = "contract-illustrator"
  val defaultCost = Some(Free)
  val name = "Illustrator - contract"
  val description =
    "Illustrations from freelance illustrators on fixed-term contracts."

  implicit val formats: Format[ContractIllustrator] =
    UsageRights.subtypeFormat(ContractIllustrator.category)(Json.format[ContractIllustrator])
}


final case class CommissionedIllustrator(creator: String, restrictions: Option[String] = None)
  extends Illustrator {
  val defaultCost = CommissionedIllustrator.defaultCost
}
object CommissionedIllustrator extends UsageRightsSpec {
  val category = "commissioned-illustrator"
  val defaultCost = Some(Free)
  val name = "Illustrator - commissioned"
  val description =
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
  val name = "Creative Commons"
  val description =
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
  val name = "Composite"
  val description =
    "Any restricted images within the composite must be identified."

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
  val name = "Public Domain"
  val description =
    "Images out of copyright or bequeathed to the public."

  override val caution = Some("ONLY use if out of copyright or bequeathed to public")

  implicit val formats: Format[PublicDomain] =
    UsageRights.subtypeFormat(PublicDomain.category)(Json.format[PublicDomain])
}
