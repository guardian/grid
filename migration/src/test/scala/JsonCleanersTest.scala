import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json.{Json, _}

class JsonCleanersTest extends FreeSpec with Matchers with JsonCleaners {

  "should strip problematic nulls from input suggestion field" - {
    val jsonString = """
        | {
        |   "suggestMetadataCredit": {
        |     "input": ["a", null, "b", "c"]
        |   },
        |   "meh": "123"
        | }
      """.stripMargin

    val json = Json.parse(jsonString)

    val transformed = json.transform(stripNullsFromSuggestMetadataCredit).get

    transformed.toString() shouldBe """{"suggestMetadataCredit":{"input":["a","b","c"]},"meh":"123"}"""
  }

}
