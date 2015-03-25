case class Edits(archived: Boolean, labels: List[String], flags: List[String], metadata: Metadata)



case class Metadata(description: String, byline: String, credit: String)
