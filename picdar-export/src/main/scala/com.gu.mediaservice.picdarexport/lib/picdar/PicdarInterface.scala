package com.gu.mediaservice.picdarexport.lib.picdar

import com.gu.mediaservice.picdarexport.model.DateRange
import org.joda.time.DateTime

import scala.xml.NodeSeq

/**
 * Created by seb on 20/01/15.
 */
trait PicdarInterface {
  type Mak = String

  object messages {

    def login(username: String, password: String) =
      <MogulAction>
        <ActionType>Login</ActionType>
        <ActionData>
          <UserName>{username}</UserName>
          <Password>{password}</Password>
        </ActionData>
      </MogulAction>

    def search(mak: Mak, dateField: String, dateRange: DateRange, urn: Option[String]) =
      <MogulAction>
        <MAK>{mak}</MAK>
        <ActionType>Search</ActionType>
        <ActionData>
          <ResultSets>Multiple</ResultSets>
          <SearchType>Asset</SearchType>
          <MMRef>{urn.getOrElse("")}</MMRef>
          {dateCriteria(dateField, dateRange.start, dateRange.end)}
        </ActionData>
      </MogulAction>
    //        <SearchField name="Caption" type="text">goat</SearchField>

    private def dateCriteria(field: String, startDate: Option[DateTime], endDate: Option[DateTime]) = {
      if (startDate.isDefined && endDate.isDefined)
        <SearchField name={ s"date_$field" } type="daterange">
          <StartDate>{startDate.get.toString("yyyyMMdd")}</StartDate>
          <EndDate>{endDate.get.toString("yyyyMMdd")}</EndDate>
        </SearchField>
      else NodeSeq.Empty
    }

    def retrieveAsset(mak: Mak, urn: String) =
      <MogulAction>
        <MAK>{mak}</MAK>
        <ActionType>RetrieveAssetData</ActionType>
        <ActionData>
          <MMRef Table="photorecord">{urn}</MMRef>
        </ActionData>
      </MogulAction>

    def retrieveResults(mak: Mak, searchId: Int, firstIndex: Int, lastIndex: Int) =
      <MogulAction>
        <MAK>{mak}</MAK>
        <ActionType>RetrieveResults</ActionType>
        <ActionData>
          <SearchType>Asset</SearchType>
          <SearchID>{searchId}</SearchID>
          <FirstIndex>{firstIndex}</FirstIndex>
          <LastIndex>{lastIndex}</LastIndex>
        </ActionData>
      </MogulAction>

    def closeSearch(mak: Mak, searchId: Int) =
      <MogulAction>
        <MAK>{mak}</MAK>
        <ActionType>SearchClose</ActionType>
        <ActionData>
          <SearchType>Asset</SearchType>
          <SearchID>{searchId}</SearchID>
        </ActionData>
      </MogulAction>

  }

}
