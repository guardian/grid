package com.gu.mediaservice.model

import play.api.libs.json._
import play.api.libs.functional.syntax._

sealed trait UsageRights {
  val category: String
  val description: String
  val restrictions: Option[String]
  val defaultRestrictions: Option[String] = None

  def name = category.replace("-", " ").split(" ").map(_.capitalize).mkString(" ")
  override def toString = category

}
object UsageRights {
  val defaultWrites: Writes[UsageRights] = (
    (__ \ "category").write[String] ~
    (__ \ "restrictions").writeNullable[String] ~
    (__ \ "defaultRestrictions").writeNullable[String]
  )(u => (u.category, u.restrictions, u.defaultRestrictions))

  implicit val jsonWrites: Writes[UsageRights] = Writes[UsageRights]{
    case o: uAgency => uAgency.jsonWrites.writes(o)
    case o: uPrImage => uPrImage.jsonWrites.writes(o)
    case o: uHandout => uHandout.jsonWrites.writes(o)
    case o: uScreengrab => uScreengrab.jsonWrites.writes(o)
    case o: uGuardianWitness => uGuardianWitness.jsonWrites.writes(o)
    case o: uSocialMedia => uSocialMedia.jsonWrites.writes(o)
    case o: uObituary => uObituary.jsonWrites.writes(o)
    case o: uStaffPhotographer => uStaffPhotographer.jsonWrites.writes(o)
    case o: NoRights => NoRights.jsonWrites.writes(o)
  }

  implicit val jsonReads: Reads[UsageRights] =
    Reads[UsageRights] { json  =>
      ((json \ "category").asOpt[String] map {
        case "agency" => uAgency.jsonReads.reads(json)
        case "PR Image" => uPrImage.jsonReads.reads(json)
        case "handout" => uHandout.jsonReads.reads(json)
        case "screengrab" => uScreengrab.jsonReads.reads(json)
        case "guardian-witness" => uGuardianWitness.jsonReads.reads(json)
        case "social-media" => uSocialMedia.jsonReads.reads(json)
        case "obituary" => uObituary.jsonReads.reads(json)
        case "staff-photographer" => uStaffPhotographer.jsonReads.reads(json)
      })
      .orElse(isNoRights(json).map(NoRights.jsonReads.reads))
      .getOrElse(JsError("No such usage rights category"))
    }

    private def isNoRights(json: JsValue): Option[JsValue] = Some(json).filter(_ == NoRights.jsonVal)
}

case class NoRights(restrictions: Option[String])
  extends UsageRights {
    val category = "no-rights"
    val description =
      "Remove any rights that have been applied to this image. It will appear as" +
      "pay to use."
  }
object NoRights {
  implicit val jsonReads: Reads[NoRights] = Json.reads[NoRights]
  implicit val jsonWrites: Writes[NoRights] = Writes[NoRights](_ => jsonVal)

  val jsonVal = Json.obj()
}


case class uAgency(supplier: String, suppliersCollection: Option[String], restrictions: Option[String])
  extends UsageRights {
    val category = "agency"
    val description =
      "Agencies such as Getty, Reuters, Press Association, etc. where " +
      "subscription fees are paid to access and use ***REMOVED***."
  }
object uAgency {
 implicit val jsonReads: Reads[uAgency] = Json.reads[uAgency]
 implicit val jsonWrites: Writes[uAgency] = (
   (__ \ "category").write[String] ~
   (__ \ "supplier").write[String] ~
   (__ \ "suppliersCollection").writeNullable[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(s => (s.category, s.supplier, s.suppliersCollection, s.restrictions))
}

case class uPrImage(restrictions: Option[String])
  extends UsageRights {
    val category = "PR Image"
    val description =
      "Used to promote specific exhibitions, auctions, etc. and only available " +
      "for such purposes."
  }

object uPrImage {
  implicit val jsonReads: Reads[uPrImage] = Json.reads[uPrImage]
  implicit val jsonWrites: Writes[uPrImage] = UsageRights.defaultWrites
}

case class uHandout(restrictions: Option[String])
  extends UsageRights {
    val category = "handout"
    val description =
      "Provided free of use for press purposes e.g. police images for new " +
      "stories, family shots in biographical pieces, etc."
  }
object uHandout {
  implicit val jsonReads: Reads[uHandout] = Json.reads[uHandout]
  implicit val jsonWrites: Writes[uHandout] = UsageRights.defaultWrites
}

case class uScreengrab(restrictions: Option[String])
  extends UsageRights {
    val category = "screengrab"
    val description =
      "Still images created by us from moving footage in television broadcasts " +
      "usually in relation to breaking news stories."
  }
object uScreengrab {
 implicit val jsonReads: Reads[uScreengrab] = Json.reads[uScreengrab]
 implicit val jsonWrites: Writes[uScreengrab] = UsageRights.defaultWrites
}


case class uGuardianWitness(restrictions: Option[String])
  extends UsageRights {
    val category = "guardian-witness"
    val description =
      "Images provided by readers in response to callouts and assignments on " +
      "GuardianWitness."

    override val defaultRestrictions = Some(
      "Contact the GuardianWitness desk before use (witness.editorial@theguardian.com)!"
    )
  }
object uGuardianWitness {
 implicit val jsonReads: Reads[uGuardianWitness] = Json.reads[uGuardianWitness]
 implicit val jsonWrites: Writes[uGuardianWitness] = UsageRights.defaultWrites
}


case class uSocialMedia(restrictions: Option[String])
  extends UsageRights {
    val category = "social-media"
    val description =
      "Images taken from public websites and social media to support " +
      "breaking news where no other image is available from usual sources. " +
      "Permission should be sought from the copyright holder, but in " +
      "extreme circumstances an image may be used with the approval of " +
      "a senior editor."
  }
object uSocialMedia {
 implicit val jsonReads: Reads[uSocialMedia] = Json.reads[uSocialMedia]
 implicit val jsonWrites: Writes[uSocialMedia] = UsageRights.defaultWrites
}


case class uObituary(restrictions: Option[String])
  extends UsageRights {
    val category = "obituary"
    val description =
      "Acquired from private sources, e.g. family members, for the purposes of " +
      "obituaries."
  }
object uObituary {
 implicit val jsonReads: Reads[uObituary] = Json.reads[uObituary]
 implicit val jsonWrites: Writes[uObituary] = UsageRights.defaultWrites
}


case class uStaffPhotographer(photographer: String, publication: String, restrictions: Option[String])
  extends UsageRights {
    val category = "staff-photographer"
    val description =
      "Pictures created by photographers who are or were members of staff."
  }
object uStaffPhotographer {
 implicit val jsonReads: Reads[uStaffPhotographer] = Json.reads[uStaffPhotographer]
 implicit val jsonWrites: Writes[uStaffPhotographer] = (
   (__ \ "category").write[String] ~
   (__ \ "photographer").write[String] ~
   (__ \ "publication").write[String] ~
   (__ \ "restrictions").writeNullable[String]
 )(s => (s.category, s.photographer, s.publication, s.restrictions))
}


