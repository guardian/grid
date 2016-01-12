package com.gu.mediaservice.picdarexport.lib.usage


object ResponseParser {
  private def clean(attr: String) = attr.trim.stripPrefix("\"").stripSuffix("\"")
  private val splitLine = """^\s*(.*?)\s*=\s(\S[\s\S]*?)""".r

  def parse(response: String) = response
    .split("\\n\\n")
    .map(_.split("\\n").toList)
    .map(
      _.flatMap(_ match {
        case splitLine(k,v) => Some(k,clean(v))
        case _ => None
      }).toMap
    )
}
