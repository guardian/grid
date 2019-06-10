package com.gu.mediaservice.model

sealed trait ImageType
case object Source extends ImageType
case object Thumbnail extends ImageType
case object OptimisedPng extends ImageType
