import lib.UsageNotice
import org.scalatest.{FreeSpec, Matchers}
import org.scalatest.prop.{Checkers, PropertyChecks}
import play.api.libs.json.JsArray

class UsageNotifierTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  "test usage to json" - {
    "make something with an id" in {
      UsageNotice("anID", JsArray()).toJson.toString() should startWith ("{\"id\":\"anID\",\"data\":[],\"lastModified\"")
    }
  }
}