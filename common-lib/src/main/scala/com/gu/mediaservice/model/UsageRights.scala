package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

sealed trait UsageRights {
  val category: String
  val description: String
  val restrictions: Option[String]
  val defaultRestrictions: Option[String] = None

  val defaultCost: Option[Cost]

  def name = category.replace("-", " ").split(" ").map(_.capitalize).mkString(" ")

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
    case o: Agency            => Agency.jsonWrites.writes(o)
    case o: PrImage           => PrImage.jsonWrites.writes(o)
    case o: Handout           => Handout.jsonWrites.writes(o)
    case o: Screengrab        => Screengrab.jsonWrites.writes(o)
    case o: GuardianWitness   => GuardianWitness.jsonWrites.writes(o)
    case o: SocialMedia       => SocialMedia.jsonWrites.writes(o)
    case o: Obituary          => Obituary.jsonWrites.writes(o)
    case o: StaffPhotographer => StaffPhotographer.jsonWrites.writes(o)
    case o: Pool              => Pool.jsonWrites.writes(o)
    case o: NoRights.type     => NoRights.jsonWrites.writes(o)
  }

  implicit val jsonReads: Reads[UsageRights] =
    Reads[UsageRights] { json  =>
      val category = (json \ "category").asOpt[String]
      (category flatMap {
        case "agency"             => json.asOpt[Agency]
        case "PR Image"           => json.asOpt[PrImage]
        case "handout"            => json.asOpt[Handout]
        case "screengrab"         => json.asOpt[Screengrab]
        case "guardian-witness"   => json.asOpt[GuardianWitness]
        case "social-media"       => json.asOpt[SocialMedia]
        case "obituary"           => json.asOpt[Obituary]
        case "staff-photographer" => json.asOpt[StaffPhotographer]
        case "pool"               => json.asOpt[Pool]
        case _                    => None
      })
      .orElse(json.asOpt[NoRights.type])
      .map(JsSuccess(_))
      .getOrElse(JsError(s"No such usage rights category: ${category.getOrElse("None")}"))
    }
}

// We have a custom writes and reads for NoRights as it is represented by `{}`
// in the DB layer.
case object NoRights
  extends UsageRights {
    val category = "no-rights"
    val defaultCost = Some(Pay)
    val restrictions = None
    val description =
      "Remove any rights that have been applied to this image. It will appear as " +
      "pay to use."

    lazy val jsonVal = Json.obj()

    implicit val jsonReads: Reads[NoRights.type] = Reads[NoRights.type]{ json =>
      if (json == jsonVal) JsSuccess(NoRights) else JsError("Value should be {} for no rights")
    }
    implicit val jsonWrites: Writes[NoRights.type] = Writes[NoRights.type](_ => jsonVal)
  }


case class Agency(supplier: String, suppliersCollection: Option[String] = None, restrictions: Option[String] = None)
  extends UsageRights {
    val category = "agency"
    val defaultCost = None
    val description =
      "Agencies such as Getty, Reuters, Press Association, etc. where " +
      "subscription fees are paid to access and use pictures."
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

case class PrImage(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "PR Image"
    val defaultCost = Some(Conditional)
    val description =
      "Used to promote specific exhibitions, auctions, etc. and only available " +
      "for such purposes."
  }

object PrImage {
  implicit val jsonReads: Reads[PrImage] = Json.reads[PrImage]
  implicit val jsonWrites: Writes[PrImage] = UsageRights.defaultWrites
}

case class Handout(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "handout"
    val defaultCost = Some(Free)
    val description =
      "Provided free of use for press purposes e.g. police images for new " +
      "stories, family shots in biographical pieces, etc."
  }
object Handout {
  implicit val jsonReads: Reads[Handout] = Json.reads[Handout]
  implicit val jsonWrites: Writes[Handout] = UsageRights.defaultWrites
}

case class Screengrab(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "screengrab"
    val defaultCost = Some(Conditional)
    val description =
      "Still images created by us from moving footage in television broadcasts " +
      "usually in relation to breaking news stories."
  }
object Screengrab {
 implicit val jsonReads: Reads[Screengrab] = Json.reads[Screengrab]
 implicit val jsonWrites: Writes[Screengrab] = UsageRights.defaultWrites
}


case class GuardianWitness(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "guardian-witness"
    val defaultCost = Some(Conditional)
    val description =
      "Images provided by readers in response to callouts and assignments on " +
      "GuardianWitness."

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
    val description =
      "Images taken from public websites and social media to support " +
      "breaking news where no other image is available from usual sources. " +
      "Permission should be sought from the copyright holder, but in " +
      "extreme circumstances an image may be used with the approval of " +
      "a senior editor."
  }
object SocialMedia {
 implicit val jsonReads: Reads[SocialMedia] = Json.reads[SocialMedia]
 implicit val jsonWrites: Writes[SocialMedia] = UsageRights.defaultWrites
}


case class Obituary(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "obituary"
    val defaultCost = Some(Conditional)
    val description =
      "Acquired from private sources, e.g. family members, for the purposes of " +
      "obituaries."
  }
object Obituary {
 implicit val jsonReads: Reads[Obituary] = Json.reads[Obituary]
 implicit val jsonWrites: Writes[Obituary] = UsageRights.defaultWrites
}


case class StaffPhotographer(photographer: String, publication: String, restrictions: Option[String] = None)
  extends UsageRights {
    val category = "staff-photographer"
    val defaultCost = Some(Free)
    val description =
      "Pictures created by photographers who are or were members of staff."
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

case class Pool(restrictions: Option[String] = None)
  extends UsageRights {
    val category = "pool"
    val defaultCost = Some(Conditional)
    val description =
      "Images issued during major national events that are free to use and" +
      "shared amongst news media organisations during that event. " +
      "Rights revert to the copyright holder when the pool is terminated."
  }
object Pool {
 implicit val jsonReads: Reads[Pool] = Json.reads[Pool]
 implicit val jsonWrites: Writes[Pool] = UsageRights.defaultWrites
}
