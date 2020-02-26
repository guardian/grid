package com.gu.mediaservice.model

import org.scalatest.{FlatSpec, Matchers}
import play.api.libs.json.{JsArray, JsString, Json}

class FileMetadataAggregatorTest extends FlatSpec with Matchers {

  it should "organise flat metadata into aggregated form and preserve the order of properties if they are stored in arrays" in {

    val testInput = Map(
      "dc:format" -> "image/png",
      "xmpMM:History[2]/stEvt:changed" -> "/",
      "xmpMM:History[5]/stEvt:parameters" -> "converted from application/vnd.adobe.photoshop to image/png",
      "photoshop:ColorMode" -> "3",
      "dc:creator[1]" -> "tmp",
      "dc:description[1]/xml:lang" -> "x-default",
      "dc:description[1]" -> "the xmp description",
      "dc:description[1]/test:1" -> "test1",
      "dc:description[1]/test:2" -> "test2",
      "dc:title[1]" -> "the xmp title",
      "dc:title[1]/xml:lang" -> "x-default",
      "xmp:MetadataDate" -> "2019-07-04T13:12:26.000Z",
      "photoshop:DocumentAncestors[3]" -> "0024E0DBC7EAA19ECC90B9B2F5F1E071",
      "xmpMM:History[6]/stEvt:instanceID" -> "xmp.iid:d9500a13-3c27-401c-a2cc-1fd027b0424f",
      "xmpMM:History[2]/stEvt:when" -> "2018-02-06T16:37:53Z",
      "exif:PixelXDimension" -> "2000",
      "photoshop:ICCProfile" -> "sRGB IEC61966-2.1",
      "photoshop:DocumentAncestors[2]" -> "00116C18A16B635936270C3F4DD02EF9",
      "photoshop:DocumentAncestors[4]" -> "00A4B614125CF2B9AC52D7A1198EE974",
      "xmpMM:DerivedFrom/stRef:documentID" -> "xmp.did:65d63b5e-a24e-4e51-89bd-6693ce193404",
      "xmpMM:History[4]/stEvt:parameters" -> "from application/vnd.adobe.photoshop to image/png",
      "xmpMM:History[6]/stEvt:action" -> "saved",
      "xmp:ModifyDate" -> "2019-07-04T13:12:26.000Z",
      "xmpMM:History[1]/stEvt:instanceID" -> "xmp.iid:65d63b5e-a24e-4e51-89bd-6693ce193404",
      "xmpMM:OriginalDocumentID" -> "xmp.did:65d63b5e-a24e-4e51-89bd-6693ce193404",
      "xmpMM:History[3]/stEvt:changed" -> "/",
      "xmpMM:DerivedFrom/stRef:originalDocumentID" -> "xmp.did:65d63b5e-a24e-4e51-89bd-6693ce193404",
      "xmpMM:History[1]/stEvt:when" -> "2018-02-06T16:36:48Z",
      "xmpMM:History[2]/stEvt:instanceID" -> "xmp.iid:f9859689-1601-43ae-99a2-9bfb3c159ded",
      "xmpMM:History[4]/stEvt:action" -> "converted",
      "tiff:YResolution" -> "1181100/10000",
      "exif:PixelYDimension" -> "2000",
      "xmpMM:History[3]/stEvt:instanceID" -> "xmp.iid:adbc5207-3f5b-4480-9e67-ed2a1871deb9",
      "xmpMM:History[1]/stEvt:action" -> "created",
      "xmp:CreateDate" -> "2018-02-06T16:36:48.000Z",
      "dc:rights[1]" -> "B814F57A-329B-441B-8564-F6D3A0973F14",
      "xmp:CreatorTool" -> "Adobe Photoshop CC 2019 (Macintosh)",
      "dc:rights[1]/xml:lang" -> "x-default",
      "xmpMM:History[3]/stEvt:softwareAgent" -> "Adobe Photoshop CC 2019 (Macintosh)",
      "xmpMM:DocumentID" -> "adobe:docid:photoshop:b55c9154-805d-a14a-a383-6b3945315d73",
      "xmpMM:History[6]/stEvt:when" -> "2019-07-04T14:12:26+01:00",
      "xmpMM:History[3]/stEvt:when" -> "2019-07-04T14:12:26+01:00",
      "tiff:Orientation" -> "1",
      "xmpMM:History[2]/stEvt:softwareAgent" -> "Adobe Photoshop CC (Macintosh)",
      "xmpMM:History[6]/stEvt:softwareAgent" -> "Adobe Photoshop CC 2019 (Macintosh)",
      "xmpMM:DerivedFrom/stRef:instanceID" -> "xmp.iid:adbc5207-3f5b-4480-9e67-ed2a1871deb9",
      "xmpMM:History[1]/stEvt:softwareAgent" -> "Adobe Photoshop CC (Macintosh)",
      "photoshop:DocumentAncestors[1]" -> "0",
      "2darr:test[3][4]" -> "d",
      "2darr:test[2][1]" -> "a",
      "2darr:test[3][3]" -> "c",
      "2darr:test[1][2]" -> "b",
      "2darr:test[1][1]" -> "0",
      "2darr:test[1][1]" -> "a",
      "2darr:test[1][3]" -> "c",
      "2darr:test[3][1]" -> "a",
      "2darr:test[3][2]" -> "b",
      "test:nested-object[1]/prop[1]" -> "0",
      "test:nested-object[1]/prop[2]" -> "1",
      "test:nested-object[1]/prop[3]" -> "2",
      "test:nested-object[1]/prop2[1]" -> "0",
      "test:nested-object[2]/prop[1]" -> "a",
      "xmpMM:History[5]/stEvt:action" -> "derived",
      "exif:ColorSpace" -> "1",
      "xmpMM:History[3]/stEvt:action" -> "saved",
      "xmpMM:History[6]/stEvt:changed" -> "/",
      "tiff:ResolutionUnit" -> "3",
      "tiff:XResolution" -> "1181100/10000",
      "xmpMM:History[2]/stEvt:action" -> "saved",
      "xmpMM:InstanceID" -> "xmp.iid:d9500a13-3c27-401c-a2cc-1fd027b0424f",
      "schema:imageHasSubject" -> "http://id.ukpds.org/Cz0WNho9",
      "schema:imageHasSubject/rdf:type" -> "http://id.ukpds.org/schema/Person",
    )

    val actual = FileMetadataAggregator.aggregateMetadataMap(testInput)

    val expected = Map(
      "schema:imageHasSubject" -> JsArray(Seq(
        "{'rdf:type':'http://id.ukpds.org/schema/Person'}",
        "http://id.ukpds.org/Cz0WNho9"
      ).map(JsString)),
      "dc:format" -> JsString("image/png"),
      "photoshop:ColorMode" -> JsString("3"),
      "dc:description" -> JsArray(Seq(
        JsString("the xmp description"),
        JsArray(Seq(
          "{'test:2':'test2'}",
          "{'xml:lang':'x-default'}",
          "{'test:1':'test1'}",
        ).map(JsString)),
      )),
      "dc:title" -> JsArray(Seq(
        JsString("the xmp title"),
        JsArray(Seq("{'xml:lang':'x-default'}").map(JsString)),
      )),
      "xmp:MetadataDate" -> JsString("2019-07-04T13:12:26.000Z"),
      "xmpMM:DerivedFrom" -> JsArray(Seq(
        "{'stRef:instanceID':'xmp.iid:adbc5207-3f5b-4480-9e67-ed2a1871deb9'}",
        "{'stRef:documentID':'xmp.did:65d63b5e-a24e-4e51-89bd-6693ce193404'}",
        "{'stRef:originalDocumentID':'xmp.did:65d63b5e-a24e-4e51-89bd-6693ce193404'}",
      ).map(JsString)),
      "exif:PixelXDimension" -> JsString("2000"),
      "photoshop:ICCProfile" -> JsString("sRGB IEC61966-2.1"),
      "xmp:ModifyDate" -> JsString("2019-07-04T13:12:26.000Z"),
      "xmpMM:OriginalDocumentID" -> JsString("xmp.did:65d63b5e-a24e-4e51-89bd-6693ce193404"),
      "tiff:YResolution" -> JsString("1181100/10000"),
      "exif:PixelYDimension" -> JsString("2000"),
      "xmp:CreateDate" -> JsString("2018-02-06T16:36:48.000Z"),
      "dc:rights" -> JsArray(Seq(
        JsString("B814F57A-329B-441B-8564-F6D3A0973F14"),
        JsArray(Seq(
          "{'xml:lang':'x-default'}"
        ).map(JsString)),
      )),
      "xmp:CreatorTool" -> JsString("Adobe Photoshop CC 2019 (Macintosh)"),
      "photoshop:DocumentAncestors" -> JsArray(Seq(
        "0",
        "00116C18A16B635936270C3F4DD02EF9",
        "0024E0DBC7EAA19ECC90B9B2F5F1E071",
        "00A4B614125CF2B9AC52D7A1198EE974"
      ).map(JsString)),
      "2darr:test" -> JsArray(
        Seq(
          JsArray(Seq("a", "b", "c").map(JsString)),
          JsArray(Seq("a").map(JsString)),
          JsArray(Seq("a", "b", "c", "d").map(JsString)),
        )
      ),
      "test:nested-object" -> JsArray(Seq(
        JsArray(Seq(
          "{'prop':['0','1','2']}",
          "{'prop2':['0']}",
        ).map(JsString)),
        JsArray(Seq(
          "{'prop':['a']}",
        ).map(JsString))
      )),
      "xmpMM:DocumentID" -> JsString("adobe:docid:photoshop:b55c9154-805d-a14a-a383-6b3945315d73"),
      "tiff:Orientation" -> JsString("1"),
      "dc:creator" -> JsArray(Seq(JsString("tmp"))),
      "exif:ColorSpace" -> JsString("1"),
      "xmpMM:History" -> JsArray(Seq(
        JsArray(Seq(
          "{'stEvt:softwareAgent':'Adobe Photoshop CC (Macintosh)'}",
          "{'stEvt:action':'created'}",
          "{'stEvt:instanceID':'xmp.iid:65d63b5e-a24e-4e51-89bd-6693ce193404'}",
          "{'stEvt:when':'2018-02-06T16:36:48Z'}",
        ).map(JsString)),
        JsArray(Seq(
          "{'stEvt:action':'saved'}",
          "{'stEvt:softwareAgent':'Adobe Photoshop CC (Macintosh)'}",
          "{'stEvt:instanceID':'xmp.iid:f9859689-1601-43ae-99a2-9bfb3c159ded'}",
          "{'stEvt:changed':'/'}",
          "{'stEvt:when':'2018-02-06T16:37:53Z'}",
        ).map(JsString)),
        JsArray(Seq(
          "{'stEvt:action':'saved'}",
          "{'stEvt:when':'2019-07-04T14:12:26+01:00'}",
          "{'stEvt:softwareAgent':'Adobe Photoshop CC 2019 (Macintosh)'}",
          "{'stEvt:changed':'/'}",
          "{'stEvt:instanceID':'xmp.iid:adbc5207-3f5b-4480-9e67-ed2a1871deb9'}",
        ).map(JsString)),
        JsArray(Seq(
          "{'stEvt:parameters':'from application/vnd.adobe.photoshop to image/png'}",
          "{'stEvt:action':'converted'}",
        ).map(JsString)),
        JsArray(Seq(
          "{'stEvt:parameters':'converted from application/vnd.adobe.photoshop to image/png'}",
          "{'stEvt:action':'derived'}",
        ).map(JsString)),
        JsArray(Seq(
          "{'stEvt:changed':'/'}",
          "{'stEvt:softwareAgent':'Adobe Photoshop CC 2019 (Macintosh)'}",
          "{'stEvt:when':'2019-07-04T14:12:26+01:00'}",
          "{'stEvt:instanceID':'xmp.iid:d9500a13-3c27-401c-a2cc-1fd027b0424f'}",
          "{'stEvt:action':'saved'}",
        ).map(JsString))
      )),
      "tiff:ResolutionUnit" -> JsString("3"),
      "tiff:XResolution" -> JsString("1181100/10000"),
      "xmpMM:InstanceID" -> JsString("xmp.iid:d9500a13-3c27-401c-a2cc-1fd027b0424f")
    )

    actual shouldEqual expected

  }

}
