import java.net.URI
import play.api.libs.json.{JsString, Writes}

package object model {

  implicit val URIWrites: Writes[URI] =
    new Writes[URI] {
      def writes(o: URI) = JsString(o.toString)
    }

}
