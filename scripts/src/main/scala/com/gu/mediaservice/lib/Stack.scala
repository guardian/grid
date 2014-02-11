package com.gu.mediaservice.lib

import java.io.InputStream
import com.amazonaws.services.cloudformation.model.Parameter

case class Stack(stage: Stage, name: String, template: InputStream, parameters: List[Parameter])

sealed trait Stage
case object Prod extends Stage { override def toString = "PROD" }
case object Test extends Stage { override def toString = "TEST" }
