package lib

import com.gu.mediaservice.lib.argo.model.Link
import com.gu.mediaservice.lib.formatting.printDateTime
import io.lemonlabs.uri.Url
import lib.elasticsearch.SearchParams
import org.http4s.UriTemplate
import org.joda.time.DateTime

object Api {

  def getPrevLink(searchParams: SearchParams, path: String): Option[Link] = {
    val prevOffset = List(searchParams.offset - searchParams.length, 0).max
    if (searchParams.offset > 0) {
      // adapt length to avoid overlapping with current
      val prevLength = List(searchParams.length, searchParams.offset - prevOffset).min
      val prevUrl = getSearchUrl(searchParams, prevOffset, prevLength, path)
      Some(Link("prev", prevUrl))
    } else {
      None
    }
  }

  def getNextLink(searchParams: SearchParams, totalCount: Long, path: String): Option[Link] = {
    val nextOffset = searchParams.offset + searchParams.length
    if (nextOffset < totalCount) {
      val nextUrl = getSearchUrl(searchParams, nextOffset, searchParams.length, path)
      Some(Link("next", nextUrl))
    } else {
      None
    }
  }

  private def getSearchUrl(searchParams: SearchParams, updatedOffset: Int, length: Int, path: String): String = {
    // Enforce a toDate to exclude new images since the current request
    val baseUrl = Url.parse(s"/$path")
    val paramMap: Map[String, String] = SearchParams.toStringMap(searchParams) ++ Map(
      "offset" -> updatedOffset.toString,
      "length" -> length.toString,
    )
    baseUrl.addParams(paramMap).toString
  }
}
