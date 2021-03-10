package com.gu.mediaservice

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.Json

class JsonDiffTest extends FunSpec with Matchers {

  def load(s:String) = Json.parse(s.stripMargin.split("\n").map(_.trim).mkString(""))

  it ("should detect identity") {

    val jsonA = load(""" {"a": 1} """)

    val jsonB = load(""" {"a": 1} """)

    val jsonC = load("""{}""")

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

  it ("should detect changes") {

    val jsonA = load(""" {"a": 1} """)

    val jsonB = load(""" {"a": 2} """)

    val jsonC = load("""
      |{
      |  "a": {
      |    "~": {
      |      "+": 1,
      |      "-": 2
      |    }
      |  }
      |}
      """)

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

  it ("should detect additions") {

    val jsonA = load(""" {} """)

    val jsonB = load("""{"a": 2}""")

    val jsonC = load("""
      | {
      |   "a": {
      |     "+": 2
      |   }
      | }
    """)

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

  it ("should detect removals") {

    val jsonA = load(""" {"a": 1} """)

    val jsonB = load("{}")

    val jsonC = load("""
      |{
      |  "a": {
      |    "-": 1
      |  }
      |}
    """)

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

  it ("should detect complex changes") {

    val jsonA = load("""
                       |{
                       |  "a": {
                       |    "b": "apple"
                       |  }
                       |}
    """)

    val jsonB = load("""
                       |{
                       |  "a": {
                       |    "c": "orange"
                       |  }
                       |}
    """)

    val jsonC = load("""
                       |{
                       |  "a": {
                       |    "~": {
                       |      "b": {"-": "apple"},
                       |      "c": {"+": "orange"}
                       |    }
                       |  }
                       |}
      """)

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

  it ("should ignore stuff that is the same") {

    val jsonA = load("""
                       |{
                       |  "a": {
                       |    "b": "apple"
                       |  },
                       |  "b": {"c": "whelk"}
                       |}
    """)

    val jsonB = load("""
                       |{
                       |  "a": {
                       |    "c": "orange"
                       |  },
                       |  "b": {"c": "whelk"}
                       |}
    """)

    val jsonC = load("""
                       |{
                       |  "a": {
                       |    "~": {
                       |      "b": {"-": "apple"},
                       |      "c": {"+": "orange"}
                       |    }
                       |  }
                       |}
      """)

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

  it ("should find different elements in arrays") {

    val jsonA = load("""
                       |{
                       |  "a": [1, 3, 4]
                       |}
    """)

    val jsonB = load("""
                       |{
                       |  "a": [1, 2, 4]
                       |}
    """)

    val jsonC = load("""
                       |{
                       |  "a": {
                       |    "~": {
                       |      "+": [2],
                       |      "-": [3]
                       |    }
                       |  }
                       |}
      """)

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

  it ("should handle and find completely different elements in arrays") {

    val jsonA = load("""
                       |{
                       |  "a": [1, "b", 3]
                       |}
    """)

    val jsonB = load("""
                       |{
                       |  "a": ["a", 2, "c"]
                       |}
    """)

    val jsonC = load("""
                       |{
                       |  "a": {
                       |    "~": {
                       |      "+": ["a", 2, "c"],
                       |      "-": [1, "b", 3]
                       |    }
                       |  }
                       |}
      """)

    JsonDiff.diff(jsonA, jsonB) should be (jsonC)
  }

}


