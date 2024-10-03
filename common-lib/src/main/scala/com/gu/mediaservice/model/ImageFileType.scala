package com.gu.mediaservice.model

sealed trait ImageFileType
case object Source extends ImageFileType
case object Thumbnail extends ImageFileType
case object OptimisedPng extends ImageFileType
