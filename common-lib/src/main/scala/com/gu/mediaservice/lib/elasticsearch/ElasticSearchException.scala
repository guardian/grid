package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticError

trait ElasticSearchError {
  self: Throwable =>
  def error: ElasticError

  def markerContents: Map[String, Any]
}

object ElasticSearchException {

  def causes(c: ElasticError.CausedBy):List[(String, Any)] = {
    val script = c.other("script").getOrElse("no script")
    val lang = c.other("lang").getOrElse("no language")
    List("causedBy" -> c.toString(), "scriptStack" ->  c.scriptStack.mkString("\n"), "script" -> script, "lang" -> lang )
  }

  def apply(e: ElasticError): Exception with ElasticSearchError = {
    e match {
      case ElasticError(t, r, _, _, _, Seq(), None, _, _, _) => // No root causes provided.
        new Exception(s"query failed because: $r type: $t") with ElasticSearchError {
          override def error: ElasticError = e

          override def markerContents: Map[String, Any] = Map("reason" -> r, "type" -> t)
        }
      case ElasticError(t, r, _, _, _, Seq(), Some(c), _, _, _) =>
        new Exception(s"query failed because: $r type: $t caused by $c") with ElasticSearchError {
          override def error: ElasticError = e
          override def markerContents: Map[String, Any] = (List("reason" -> r, "type" -> t) ::: causes(c)).toMap
        }
      case ElasticError(t, r, _, _, _, s, None, _, _, _) =>
        new Exception(s"query failed because: $r type: $t root cause ${s.mkString(",\n ")}") with ElasticSearchError {
          override def error: ElasticError = e

          override def markerContents: Map[String, Any] = Map("reason" -> r, "type" -> t, "rootCause" -> s.mkString(",\n"))
        }
      case ElasticError(t, r, _, _, _, s, Some(c), _, _, _) =>
        new Exception(s"query failed because: $r type: $t root cause ${s.mkString(", ")}, caused by $c") with ElasticSearchError {
          override def error: ElasticError = e

          override def markerContents: Map[String, Any] = (List("reason" -> r, "type" -> t, "rootCause" -> s.mkString(",\n"), "causedBy" -> c.toString()) ::: causes(c)).toMap
        }
      case _ => new Exception(s"query failed because: unknown error") with ElasticSearchError {
        override def error: ElasticError = e

        override def markerContents: Map[String, Any] = Map("reason" -> "unknown Elastic Search error")
      }
    }
  }

  def unapply(arg: ElasticSearchError): Option[(ElasticError, LogMarker)] = Some((arg.error, MarkerMap(arg.markerContents)))
}

case object ElasticNotFoundException extends Exception(s"Elastic Search Document Not Found")
