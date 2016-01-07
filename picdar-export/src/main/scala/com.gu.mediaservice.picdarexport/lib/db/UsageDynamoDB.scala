package com.gu.mediaservice.picdarexport.lib.db

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.regions.Region

import com.gu.mediaservice.lib.aws.DynamoDB


class UsageDynamoDB(credentials: AWSCredentials, region: Region, tableName: String)
  extends DynamoDB(credentials, region, tableName) {

  override val IdKey = "picdarUrn"
  val RangeKey = "picdarCreated"

}
