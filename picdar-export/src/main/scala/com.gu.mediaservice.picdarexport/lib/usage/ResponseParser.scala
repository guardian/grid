package com.gu.mediaservice.picdarexport.lib.usage


object ResponseParser {
  private def clean(attr: String) = attr.trim.stripPrefix("\"").stripSuffix("\"")
  private val splitLine = """^\s*(.*?)\s*=\s(\S[\s\S]*?)""".r

  // Sample Picdar Usage API response:

  /*
   * _parent = 1871903 (0x1c901f) 34096377 (0x20844f9)
   * _urn = 99999999 (0x3034499)
   * _date = 02/01/2010
   * _time = 05:04:08
   * publicationtext = The Guardian
   * production = production_name
   * page = 14
   * editiontext = First
   * sectiontext = spr
   * publicationdate = 02/01/2010
   * notes =
   * status = "published"
   *
   * _parent = 1871903 (0x1c901f) 42427178 (0x287632a)
   * _urn = 99999998 (0x3034499)
   * _date = 02/01/2010
   * _time = 01:06:49
   * publicationtext = The Guardian
   * production = production_name
   * page = 14
   * editiontext = 1
   * sectiontext = spr
   * publicationdate = 02/01/2010
   * notes = Usually Aname
   * status = "pending"
   */

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
