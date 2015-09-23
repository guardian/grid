package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

sealed trait UsageRights {
  val category: String
  val name: String
  val description: String
  val restrictions: Option[String]
  val defaultCost: Option[Cost]

  val defaultRestrictions: Option[String] = None
  val caution: Option[String] = None
}
object UsageRights {
  val defaultWrites: Writes[UsageRights] = (
    (__ \ "category").write[String] ~
    (__ \ "restrictions").writeNullable[String]
  )(u => (u.category, u.restrictions.orElse(u.defaultRestrictions)))
  // as this is rendering logic, we leave it here, displaying the default
  // restrictions if restrictions are omitted


  // When using `Json.as[UsageRights]` or `Json.toJson(usageRights)` we want to
  // make sure we right the correct subtype parser. This allows us to retain any
  // additional fields to the case classes (like "photographer" on
  // `StaffPhotographer`), or, as in the case of `NoRights`, create a custom parser
  // all together.
  // TODO: I haven't figured out why Json.toJson[T](o) doesn't work here, it'd
  // be good to know though.
  implicit def jsonWrites[T <: UsageRights]: Writes[T] = Writes[T] {
    case o: Chargeable               => Chargeable.jsonWrites.writes(o)
    case o: Agency                   => Agency.jsonWrites.writes(o)
    case o: CommissionedAgency       => CommissionedAgency.jsonWrites.writes(o)
    case o: PrImage                  => PrImage.jsonWrites.writes(o)
    case o: Handout                  => Handout.jsonWrites.writes(o)
    case o: Screengrab               => Screengrab.jsonWrites.writes(o)
    case o: GuardianWitness          => GuardianWitness.jsonWrites.writes(o)
    case o: SocialMedia              => SocialMedia.jsonWrites.writes(o)
    case o: Obituary                 => Obituary.jsonWrites.writes(o)
    case o: StaffPhotographer        => StaffPhotographer.jsonWrites.writes(o)
    case o: ContractPhotographer     => ContractPhotographer.jsonWrites.writes(o)
    case o: CommissionedPhotographer => CommissionedPhotographer.jsonWrites.writes(o)
    case o: Pool                     => Pool.jsonWrites.writes(o)
    case o: CrownCopyright           => CrownCopyright.jsonWrites.writes(o)
    case o: ContractIllustrator      => ContractIllustrator.jsonWrites.writes(o)
    case o: CommissionedIllustrator  => CommissionedIllustrator.jsonWrites.writes(o)
    case o: CreativeCommons          => CreativeCommons.jsonWrites.writes(o)
    case o: NoRights.type            => NoRights.jsonWrites.writes(o)
  }

  implicit val jsonReads: Reads[UsageRights] =
    Reads[UsageRights] { json  =>
      val category = (json \ "category").asOpt[String]

      // We use supplier as an indicator that an image is an Agency
      // image as some images have been indexed without a category.
      // TODO: Fix with reindex
      val supplier = (json \ "supplier").asOpt[String]

      (category flatMap {
        case "chargeable"                => json.asOpt[Chargeable]
        case "agency"                    => json.asOpt[Agency]
        case "commissioned-agency"       => json.asOpt[CommissionedAgency]
        case "PR Image"                  => json.asOpt[PrImage]
        case "handout"                   => json.asOpt[Handout]
        case "screengrab"                => json.asOpt[Screengrab]
        case "guardian-witness"          => json.asOpt[GuardianWitness]
        case "social-media"              => json.asOpt[SocialMedia]
        case "obituary"                  => json.asOpt[Obituary]
        case "staff-photographer"        => json.asOpt[StaffPhotographer]
        case "contract-photographer"     => json.asOpt[ContractPhotographer]
        case "commissioned-photographer" => json.asOpt[CommissionedPhotographer]
        case "pool"                      => json.asOpt[Pool]
        case "crown-copyright"           => json.asOpt[CrownCopyright]
        case "contract-illustrator"      => json.asOpt[ContractIllustrator]
        case "commissioned-illustrator"  => json.asOpt[CommissionedIllustrator]
        case "creative-commons"          => json.asOpt[CreativeCommons]
        case _                           => None
      })
      .orElse(supplier.flatMap(_ => json.asOpt[Agency]))
      .orElse(json.asOpt[NoRights.type])
      .map(JsSuccess(_))
      .getOrElse(JsError(s"No such usage rights category: ${category.getOrElse("None")}"))
    }
}

trait Photographer extends UsageRights {
  val photographer: String
}

// We have a custom writes and reads for NoRights as it is represented by `{}`
// in the DB layer.
case object NoRights
  extends UsageRights {
    val category = ""
    val defaultCost = None
    val restrictions = None
    val name = "No Rights"
    val description =
      "Images for which we do not have the rights to use."

    lazy val jsonVal = Json.obj()

    implicit val jsonReads: Reads[NoRights.type] = Reads[NoRights.type]{ json =>
      if (json == jsonVal) JsSuccess(NoRights) else JsError("Value should be {} for no rights")
    }
    implicit val jsonWrites: Writes[NoRights.type] = Writes[NoRights.type](_ => jsonVal)
  }


case class Chargeable(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "chargeable"
    val defaultCost = Some(Pay)
    val name = "Chargeable supplied / on spec"
    val description =
      "Images acquired by or supplied to GNM that do not fit other categories in the Grid and " +
      "therefore fees will be payable per use. Unless negotiated otherwise, fees should be based on " +
      "standard published GNM rates for stock and speculative images."
  }
object Chargeable {
 implicit val jsonReads: Reads[Chargeable] = Json.reads[Chargeable]
 implicit val jsonWrites: Writes[Chargeable] = UsageRights.defaultWrites
}

case class Agency(supplier: String, suppliersCollection: Option[String] = None, restrictions: Option[String] = None)
  extends UsageRights {
    val category = "agency"
    val defaultCost = None
    val name = "Agency - subscription"
    val description =
      "Agencies such as Getty, Reuters, Press Association, etc. where subscription fees are paid " +
      "to access and use pictures."
  }
object Agency {
 implicit val jsonReads: Reads[Agency] = Json.reads[Agency]
 implicit val jsonWrites: Writes[Agency] = (
   (__ \ "category").write[String] ~
   (__ \ "supplier").write[String] ~
   (__ \ "suppliersCollection").writeNullable[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(s => (s.category, s.supplier, s.suppliersCollection, s.restrictions))
}


case class CommissionedAgency(supplier: String, restrictions: Option[String] = None)
  extends UsageRights {
    val category = "commissioned-agency"
    val defaultCost = Some(Free)
    val name = "Agency - commissioned"
    val description =
      "Images commissioned from agencies on an ad hoc basis."
  }
object CommissionedAgency {
 implicit val jsonReads: Reads[CommissionedAgency] = Json.reads[CommissionedAgency]
 implicit val jsonWrites: Writes[CommissionedAgency] = (
   (__ \ "category").write[String] ~
   (__ \ "supplier").write[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(s => (s.category, s.supplier, s.restrictions))
}


case class PrImage(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "PR Image"
    val defaultCost = Some(Free)
    val name = "PR Image"
    val description =
      "Images supplied for publicity purposes such as press launches, charity events, travel, " +
      "promotional images, etc."
  }

object PrImage {
  implicit val jsonReads: Reads[PrImage] = Json.reads[PrImage]
  implicit val jsonWrites: Writes[PrImage] = UsageRights.defaultWrites
}


case class Handout(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "handout"
    val defaultCost = Some(Free)
    val name = "Handout"
    val description =
      "Images supplied on general release to all media e.g. images provided by police for new " +
      "stories, family shots in biographical pieces, etc."
  }
object Handout {
  implicit val jsonReads: Reads[Handout] = Json.reads[Handout]
  implicit val jsonWrites: Writes[Handout] = UsageRights.defaultWrites
}


case class Screengrab(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "screengrab"
    val defaultCost = Some(Free)
    val name = "Screengrab"
    val description =
      "Stills created by GNM from moving footage in television broadcasts usually in relation to " +
      "breaking news stories."
  }
object Screengrab {
 implicit val jsonReads: Reads[Screengrab] = Json.reads[Screengrab]
 implicit val jsonWrites: Writes[Screengrab] = UsageRights.defaultWrites
}


case class GuardianWitness(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "guardian-witness"
    val defaultCost = Some(Conditional)
    val name = "GuardianWitness"
    val description =
      "Images provided by readers in response to callouts and assignments on GuardianWitness."

    override val defaultRestrictions = Some(
      "Contact the GuardianWitness desk before use (witness.editorial@theguardian.com)!"
    )
  }
object GuardianWitness {
 implicit val jsonReads: Reads[GuardianWitness] = Json.reads[GuardianWitness]
 implicit val jsonWrites: Writes[GuardianWitness] = UsageRights.defaultWrites
}


case class SocialMedia(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "social-media"
    val defaultCost = Some(Conditional)
    val name = "Social Media"
    val description =
      "Images grabbed from social media to support breaking news where no other image is available " +
      "from usual sources."

   override val caution =
    Some("Approval needed from senior editor if permission from owner cannot be acquired")
  }
object SocialMedia {
 implicit val jsonReads: Reads[SocialMedia] = Json.reads[SocialMedia]
 implicit val jsonWrites: Writes[SocialMedia] = UsageRights.defaultWrites
}


case class Obituary(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "obituary"
    val defaultCost = Some(Conditional)
    val name = "Obituary"
    val description =
      "Images acquired from private sources, e.g. family members, for the purposes of obituaries."

    override val defaultRestrictions = Some(
      "Only to be used in context with person's obituary"
    )
  }
object Obituary {
 implicit val jsonReads: Reads[Obituary] = Json.reads[Obituary]
 implicit val jsonWrites: Writes[Obituary] = UsageRights.defaultWrites
}


case class StaffPhotographer(photographer: String, publication: String, restrictions: Option[String] = None)
  extends Photographer {
    val category = "staff-photographer"
    val defaultCost = Some(Free)
    val name = "Photographer - staff"
    val description =
      "Images from photographers who are or were members of staff."
  }
object StaffPhotographer {
 implicit val jsonReads: Reads[StaffPhotographer] = Json.reads[StaffPhotographer]
 implicit val jsonWrites: Writes[StaffPhotographer] = (
   (__ \ "category").write[String] ~
   (__ \ "photographer").write[String] ~
   (__ \ "publication").write[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(s => (s.category, s.photographer, s.publication, s.restrictions))
}


case class ContractPhotographer(photographer: String, publication: Option[String] = None, restrictions: Option[String] = None)
  extends Photographer {
    val category = "contract-photographer"
    val defaultCost = Some(Free)
    val name = "Photographer - contract"
    val description =
      "Images from freelance photographers on fixed-term contracts."
  }
object ContractPhotographer {
 implicit val jsonReads: Reads[ContractPhotographer] = Json.reads[ContractPhotographer]
 implicit val jsonWrites: Writes[ContractPhotographer] = (
   (__ \ "category").write[String] ~
   (__ \ "photographer").write[String] ~
   (__ \ "publication").writeNullable[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(s => (s.category, s.photographer, s.publication, s.restrictions))
}


case class CommissionedPhotographer(photographer: String, publication: Option[String] = None, restrictions: Option[String] = None)
  extends Photographer {
    val category = "commissioned-photographer"
    val defaultCost = Some(Free)
    val name = "Photographer - commissioned"
    val description =
      "Images commissioned from freelance photographers on an ad hoc basis."
  }
object CommissionedPhotographer {
 implicit val jsonReads: Reads[CommissionedPhotographer] = Json.reads[CommissionedPhotographer]
 implicit val jsonWrites: Writes[CommissionedPhotographer] = (
   (__ \ "category").write[String] ~
   (__ \ "photographer").write[String] ~
   (__ \ "publication").writeNullable[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(s => (s.category, s.photographer, s.publication, s.restrictions))
}


case class Pool(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "pool"
    val defaultCost = Some(Conditional)
    val name = "Pool"
    val description =
      "Images issued during major national events that are free to use and shared amongst news " +
      "media organisations. Rights revert to the copyright holder when the pool is terminated."
  }
object Pool {
 implicit val jsonReads: Reads[Pool] = Json.reads[Pool]
 implicit val jsonWrites: Writes[Pool] = UsageRights.defaultWrites
}


case class CrownCopyright(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "crown-copyright"
    val defaultCost = Some(Free)
    val name = "Crown copyright"
    val description =
      "Crown copyright covers material created by Government. Material may be used subject to " +
      "acknowledgement."
  }
object CrownCopyright {
 implicit val jsonReads: Reads[CrownCopyright] = Json.reads[CrownCopyright]
 implicit val jsonWrites: Writes[CrownCopyright] = UsageRights.defaultWrites
}

case class ContractIllustrator(creator: String, restrictions: Option[String] = None)
  extends UsageRights {
    val category = "contract-illustrator"
    val defaultCost = Some(Free)
    val name = "Illustrator - contract"
    val description =
      "Illustrations from freelance illustrators on fixed-term contracts."
  }
object ContractIllustrator {
 implicit val jsonReads: Reads[ContractIllustrator] = Json.reads[ContractIllustrator]
 implicit val jsonWrites: Writes[ContractIllustrator] = (
   (__ \ "category").write[String] ~
   (__ \ "creator").write[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(i => (i.category, i.creator, i.restrictions))
}

case class CommissionedIllustrator(creator: String, restrictions: Option[String] = None)
  extends UsageRights {
    val category = "commissioned-illustrator"
    val defaultCost = Some(Free)
    val name = "Illustrator - commissioned"
    val description =
      "Illustrations commissioned from freelance illustrators on an ad hoc basis."
  }
object CommissionedIllustrator {
 implicit val jsonReads: Reads[CommissionedIllustrator] = Json.reads[CommissionedIllustrator]
 implicit val jsonWrites: Writes[CommissionedIllustrator] = (
   (__ \ "category").write[String] ~
   (__ \ "creator").write[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(i => (i.category, i.creator, i.restrictions))
}

case class CreativeCommons(licence: String, source: String, creator: String, contentLink: String,
                           restrictions: Option[String] = None)
  extends UsageRights {
    val category = "creative-commons"
    val defaultCost = Some(Free)
    val name = "Creative Commons"
    val description =
      "Images made available by rights holders on open licence terms that grant third parties " +
      "permission to use and share copyright material for free."

    override val caution = Some("This only applies to COMMERCIAL creative commons licences.")
  }
object CreativeCommons {
 implicit val jsonReads: Reads[CreativeCommons] = Json.reads[CreativeCommons]
 implicit val jsonWrites: Writes[CreativeCommons] = (
   (__ \ "category").write[String] ~
   (__ \ "licence").write[String] ~
   (__ \ "source").write[String] ~
   (__ \ "creator").write[String] ~
   (__ \ "contentLink").write[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(i => (i.category, i.licence, i.source, i.creator, i.contentLink, i.restrictions))
}
