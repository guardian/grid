package com.gu.mediaservice

import com.gu.mediaservice.lib.metrics.FutureSyntax

package object syntax
  extends ElasticSearchSyntax
  with PlayJsonSyntax
  with FutureSyntax
  with ProcessSyntax
