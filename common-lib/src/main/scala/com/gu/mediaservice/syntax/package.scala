package com.gu.mediaservice

import com.gu.mediaservice.lib.metrics.FutureSyntax

package object syntax
  extends PlayJsonSyntax
  with RequestHeaderSyntax
  with FutureSyntax
