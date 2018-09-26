package model

import com.gu.contentapi.client.model.v1._
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.{FreeSpec, Matchers}

class ContentWrapperTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  "test extract id from fields" - {
    "make something with a composer id" in {
        ContentWrapper.extractId(contentWithComposerId) should be (Some("composer/composerCode"))
      }
    }

      val contentWithComposerId = new {val id: String = "myId"} with Content {
        override def `type`: ContentType = ???

        override def sectionId: Option[String] = ???

        override def sectionName: Option[String] = ???

        override def webPublicationDate: Option[CapiDateTime] = ???

        override def webTitle: String = ???

        override def webUrl: String = ???

        override def apiUrl: String = ???

        override def fields: Option[ContentFields] = Some(new {
          val internalComposerCode: Option[String] = Some("composerCode")
        } with ContentFields {
          override def wordcount: Option[Int] = ???

          override def liveBloggingNow: Option[Boolean] = ???

          override def internalCommissionedWordcount: Option[Int] = ???

          override def newspaperEditionDate: Option[CapiDateTime] = ???

          override def internalRevision: Option[Int] = ???

          override def allowUgc: Option[Boolean] = ???

          override def internalStoryPackageCode: Option[Int] = ???

          override def commentCloseDate: Option[CapiDateTime] = ???

          override def standfirst: Option[String] = ???

          override def shortSocialShareText: Option[String] = ???

          override def sensitive: Option[Boolean] = ???

          override def contributorBio: Option[String] = ???

          override def displayHint: Option[String] = ???

          override def shouldHideReaderRevenue: Option[Boolean] = ???

          override def shouldHideAdverts: Option[Boolean] = ???

          override def membershipAccess: Option[MembershipTier] = ???

          override def secureThumbnail: Option[String] = ???

          override def hasStoryPackage: Option[Boolean] = ???

          override def headline: Option[String] = ???

          override def commentable: Option[Boolean] = ???

          override def isPremoderated: Option[Boolean] = ???

          override def legallySensitive: Option[Boolean] = ???

          override def main: Option[String] = ???

          override def body: Option[String] = ???

          override def bodyText: Option[String] = ???

          override def isLive: Option[Boolean] = ???

          override def internalPageCode: Option[Int] = ???

          override def publication: Option[String] = ???

          override def trailText: Option[String] = ???

          override def isInappropriateForSponsorship: Option[Boolean] = ???

          override def thumbnail: Option[String] = ???

          override def newspaperPageNumber: Option[Int] = ???

          override def creationDate: Option[CapiDateTime] = ???

          override def socialShareText: Option[String] = ???

          override def internalShortId: Option[String] = ???

          override def lastModified: Option[CapiDateTime] = ???

          override def internalVideoCode: Option[String] = ???

          override def charCount: Option[Int] = ???

          override def shortUrl: Option[String] = ???

          override def internalOctopusCode: Option[String] = ???

          override def productionOffice: Option[Office] = ???

          override def internalContentCode: Option[Int] = ???

          override def starRating: Option[Int] = ???

          override def lang: Option[String] = ???

          override def byline: Option[String] = ???

          override def firstPublicationDate: Option[CapiDateTime] = ???

          override def scheduledPublicationDate: Option[CapiDateTime] = ???

          override def showInRelatedContent: Option[Boolean] = ???
        })

        override def tags: Seq[Tag] = ???

        override def elements: Option[Seq[Element]] = ???

        override def references: Seq[Reference] = ???

        override def isExpired: Option[Boolean] = ???

        override def blocks: Option[Blocks] = ???

        override def rights: Option[Rights] = ???

        override def crossword: Option[Crossword] = ???

        override def atoms: Option[Atoms] = ???

        override def stats: Option[ContentStats] = ???

        override def section: Option[Section] = ???

        override def debug: Option[Debug] = ???

        override def isGone: Option[Boolean] = ???

        override def isHosted: Boolean = ???

        override def pillarId: Option[String] = ???

        override def pillarName: Option[String] = ???
      }
}
