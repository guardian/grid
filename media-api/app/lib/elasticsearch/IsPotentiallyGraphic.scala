package lib.elasticsearch

/*
* This file defines the default painless script for identifying whether an image is potentially graphic.
* It can be overridden in the UI.
* You have full access to the ES document, via 'doc['field_name']'.
* You must return a boolean.
* See https://www.elastic.co/guide/en/elasticsearch/painless/8.10/painless-lang-spec.html
* See https://www.elastic.co/guide/en/elasticsearch/reference/8.10/search-fields.html#script-fields
*
* Examples:
* return new Random().nextBoolean() - would result in a random selection of pictures being flagged.
* return
* */
object IsPotentiallyGraphic {

  //language=groovy -- it's actually painless, but that's pretty similar to groovy and this provides syntax highlighting
  val painlessScript =
    """
      |return params['_source']?.metadata?.description?.toLowerCase()?.contains('graphic')
      |""".stripMargin
}
