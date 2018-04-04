import java.net.URI
import play.api.libs.json.{JsString, Writes}

package object model {

  implicit val URIWrites: Writes[URI] = (o: URI) => JsString(o.toString)

}
