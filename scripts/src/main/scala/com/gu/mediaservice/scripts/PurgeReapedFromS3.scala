package com.gu.mediaservice.scripts

import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.auth.{AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import org.apache.http.client.methods.HttpPost
import org.apache.http.entity.{ContentType, InputStreamEntity}
import org.apache.http.impl.client.HttpClients

import scala.collection.JavaConverters._

object PurgeReapedFromS3 {

  def apply(args: List[String]) {

    println("Hello World")

  }

}
