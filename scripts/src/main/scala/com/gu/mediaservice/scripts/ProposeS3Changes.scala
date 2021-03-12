package com.gu.mediaservice.scripts

import com.gu.mediaservice.JsonDiff
import com.gu.mediaservice.lib.ImageStorageProps
import com.gu.mediaservice.lib.net.URI
import org.apache.commons.compress.compressors.bzip2.{BZip2CompressorInputStream, BZip2CompressorOutputStream}
import org.joda.time.DateTime
import play.api.libs.json.Json

import java.io._
import scala.collection.mutable
import scala.io.Source
import scala.language.postfixOps

object ProposeS3Changes {
  def apply(args: List[String]): Unit = {
    args match {
      case bucketMetadata :: esMetadata :: picdarCsv :: outputFile :: Nil => proposeS3Changes(
        new File(bucketMetadata),
        new File(esMetadata),
        new File(picdarCsv),
        new File(s"$outputFile.update.jsonl.bz2"),
        new File(s"$outputFile.correct.jsonl.bz2"),
        new File(s"$outputFile.esonlykeys.txt"),
        new File(s"$outputFile.s3onlykeys.txt"),
        new File(s"$outputFile.s3badkeys.txt"),
      )
      case _ => throw new IllegalArgumentException("Usage: ProposeS3Changes <bucketMetadataFile> <esMetadataFile> <picdarCsv> <outputFilePrefix>")
    }
  }

  def getBzipWriter(outputFile: File) = {
    val fileOutputStream = new FileOutputStream(outputFile)
    val compressOutputStream = new BZip2CompressorOutputStream(fileOutputStream)
    val sw = new OutputStreamWriter(compressOutputStream)
    new BufferedWriter(sw)
  }

  def proposeS3Changes(
                        bucketMetadata: File,
                        esMetadata: File,
                        picdarCsv: File,
                        outputFileForJsonUpdate: File,
                        outputFileForJsonCorrect: File,
                        outputFileForESKeys: File,
                        outputFileForS3Keys: File,
                        outputFileForBadS3Keys: File) = {
    val picdarData = readPicdarCsv(picdarCsv)
    System.err.println(s"Completed reading ${picdarData.gridToPicdar.size} Picdar mappings")

    val s3Metadata = {
      val (md, badKeys) = readS3Metadata(bucketMetadata)
      System.err.println(s"Completed reading S3 metadata. ${md.size} records, ${badKeys.size} bad keys")
      // write out the bad keys in this scope so they can then be GCd
      val outputWriterForBadS3Keys = new FileWriter(outputFileForBadS3Keys)
      try {
        badKeys.foreach(k => outputWriterForBadS3Keys.append(s"$k\n"))
      } finally {
        outputWriterForBadS3Keys.close()
      }
      md
    }

    var s3KeysNotYetSeenInEs = s3Metadata.keySet
    var esKeysNotInS3 = Set.empty[String]

    System.err.println(s"Starting change proposals...")
    val outputWriterForJsonUpdate = getBzipWriter(outputFileForJsonUpdate)
    val outputWriterForJsonCorrect = getBzipWriter(outputFileForJsonCorrect)
    val outputWriterForESKeys = new FileWriter(outputFileForESKeys)
    val outputWriterForS3Keys = new FileWriter(outputFileForS3Keys)
    try {
      withSourceFromBzipFile(esMetadata){ source =>
        source
          .getLines()
          .flatMap(line => Json.fromJson[EsDocumentWithMetadata](Json.parse(line)).asOpt)
          .zipWithIndex
          .foreach { case (metadata, i) =>
            if (i % 10000 == 0) System.err.println(s"Processing ES metadata line $i")
            val id = metadata.id
            val maybeS3 = s3Metadata.get(id)
            maybeS3 match {
              case Some(s3Metadata) =>
                s3KeysNotYetSeenInEs -= id
                val mergedMetadata = mergeMetadata(metadata, s3Metadata, picdarData)
                if (mergedMetadata != mergeMetadata(metadata, mergedMetadata, picdarData)) {
                  System.err.println(s"Merged metadata for $id not idempotent")
                }
                if (mergedMetadata != s3Metadata) {
                  val jsS3 = Json.toJson(s3Metadata)
                  val jsMerged = Json.toJson(mergedMetadata)
                  val diff = JsonDiff.diff(jsS3, jsMerged)
                  outputWriterForJsonUpdate
                    .append(s"${Json.toJson(Json.obj(
                      "original" -> jsS3,
                      "proposed" -> jsMerged,
                      "diff" -> diff
                  )).toString()}\n")
                } else {
                  outputWriterForJsonCorrect
                    .append(s"${Json.toJson(mergedMetadata).toString()}\n")
                }
              case None =>
                esKeysNotInS3 += id
            }
          }
      }

      esKeysNotInS3.foreach(k => outputWriterForESKeys.append(s"$k\n"))
      s3KeysNotYetSeenInEs.foreach(k => outputWriterForS3Keys.append(s"$k\n"))
    } finally {
      outputWriterForJsonUpdate.close()
      outputWriterForJsonCorrect.close()
      outputWriterForESKeys.close()
      outputWriterForS3Keys.close()
    }
  }


  def mergeMetadata(esMetadata: EsDocumentWithMetadata, s3Metadata: ObjectMetadata, picdarData: PicdarData): ObjectMetadata = {
    /* If we can we should retain the legacy keys with _ in so that we don't have to touch the object */
    def bestKeyNameFor(dashVariant: String): String = {
      val hasDashVariant = s3Metadata.metadata.contains(dashVariant)
      // does this have underscore version of key?
      val underscoreVariant = dashVariant.replace("-", "_")
      val hasUnderscoreVariant = s3Metadata.metadata.contains(underscoreVariant)
      if (hasDashVariant && hasUnderscoreVariant) {
        System.err.println(s"Warning: both dash and underscore keys on ${s3Metadata.key}")
      }
      if (hasUnderscoreVariant)
        underscoreVariant
      else
        dashVariant
    }

    /* Find the "best" value, trying hard to detect values that haven't really changed despite encoding or format changes */
    def bestValue(maybeEsValue: Option[String], maybeS3Value: Option[String], isDate: Boolean = false): Option[String] = {
      def isSame(esValue: String, s3Value: String): Boolean = {
        val decodedS3 = URI.decode(s3Value)
        if (!isDate) {
          decodedS3 == esValue
        } else {
          val s3Date = DateTime.parse(decodedS3)
          val esDate = DateTime.parse(esValue)
          s3Date.equals(esDate)
        }
      }
      (maybeEsValue, maybeS3Value) match {
        case (None, s3Value) => s3Value
        case (Some(esValue), Some(s3Value)) if isSame(esValue, s3Value) => Some(s3Value)
        case (Some(esValue), _) => Some(URI.encode(esValue))
      }
    }

    val filenameKey = bestKeyNameFor(ImageStorageProps.filenameMetadataKey)
    val uploadedByKey = bestKeyNameFor(ImageStorageProps.uploadedByMetadataKey)
    val uploadTimeKey = bestKeyNameFor(ImageStorageProps.uploadTimeMetadataKey)

    if (metadataEquivalent(esMetadata, s3Metadata)) {
      s3Metadata
    } else {
      // filename: taken from ES if it exists, then from S3, otherwise empty
      val fileName = bestValue(esMetadata.fileName, s3Metadata.metadata.get(filenameKey))
        .map(s => s.replaceAll(s" (${esMetadata.id})", ""))
      // uploaded by: taken from ES if it exists, then from S3, otherwise empty
      val uploadedBy = bestValue(esMetadata.uploadedBy, s3Metadata.metadata.get(uploadedByKey))
      // uploaded time: taken from ES if it exists, then from S3, otherwise empty
      val uploadTime = bestValue(esMetadata.uploadTime, s3Metadata.metadata.get(uploadTimeKey), isDate = true)

      // Find ALL identifiers in elasticsearch (put "identifier!" on the front and make lowercase)
      val esIdentifiers = esMetadata.identifiers
        .map{ case (key, value ) => s"${ImageStorageProps.identifierMetadataKeyPrefix}$key".toLowerCase -> URI.encode(value)}

      // Find all OUR identifiers in S3 (must have "identifier!" on the front)
      val s3Identifiers = s3Metadata.metadata
        .filter{case (key, _) => key.startsWith(ImageStorageProps.identifierMetadataKeyPrefix)}

      val picdarIdEntry = picdarData.gridToPicdar.get(esMetadata.id).map(s"${ImageStorageProps.identifierMetadataKeyPrefix}picdarurn" ->)

      // Merge the two maps together with any picdar entry
      val allIdentifierKeys = s3Identifiers.keySet ++ esIdentifiers.keySet
      val identifiers = allIdentifierKeys.foldLeft(Map.empty[String, String]) { case (acc, key) =>
        acc ++ bestValue(esIdentifiers.get(key), s3Identifiers.get(key)).map(key ->)
      } ++ picdarIdEntry

      ObjectMetadata(
        key = s3Metadata.key,
        lastModified = s3Metadata.lastModified,
        metadata = identifiers
          ++ fileName.map(fn => filenameKey -> fn)
          ++ uploadedBy.map(ub => uploadedByKey -> ub)
          ++ uploadTime.map(ut => uploadTimeKey -> ut)
      )
    }
  }

  def metadataEquivalent(metadata: EsDocumentWithMetadata, s3Metadata: ObjectMetadata): Boolean = {
    metadata.uploadTime == s3Metadata.metadata.get(ImageStorageProps.uploadTimeMetadataKey) &&
      metadata.uploadedBy == s3Metadata.metadata.get(ImageStorageProps.uploadedByMetadataKey) &&
      metadata.fileName == s3Metadata.metadata.get(ImageStorageProps.filenameMetadataKey) &&
      metadata.identifiers.map{case (key, value) =>
        ImageStorageProps.identifierMetadataKeyPrefix + key.toLowerCase -> value
      } == s3Metadata.metadata.filter{ case (key, _) => key.startsWith(ImageStorageProps.identifierMetadataKeyPrefix)}
  }

  private val hex = """[0-9a-f]"""
  private val GoodKey = s"""^($hex)/($hex)/($hex)/($hex)/($hex)/($hex)/(\\1\\2\\3\\4\\5\\6$hex{34})$$""".r
  def readS3Metadata(bucketMetadata: File): (Map[String, ObjectMetadata], List[String]) = {
    val (goodEntries, badValues) = withSourceFromBzipFile(bucketMetadata){ source =>
      source.getLines().zipWithIndex.foldLeft[(mutable.Builder[(String, ObjectMetadata), Map[String, ObjectMetadata]], List[String])] (Map.newBuilder[String, ObjectMetadata], Nil) { case ((goodEntries, badKeys), (line, i)) =>
        if (i % 10000 == 0) System.err.println(s"Loading index $i")
        Json.fromJson[ObjectMetadata](Json.parse(line)).asOpt match {
          case Some(objMd@ObjectMetadata(GoodKey(_, _, _, _, _, _, id), _, _)) => (goodEntries += (id -> objMd), badKeys)
          case Some(ObjectMetadata(badKey, _, _)) => (goodEntries, badKey :: badKeys)
          case None => (goodEntries, badKeys)
        }
      }
    }
    (goodEntries.result(), badValues)
  }

  case class PicdarData(gridToPicdar: Map[String, String])

  def readPicdarCsv(picdarCsvFile: File): PicdarData = {
    val source = Source.fromFile(picdarCsvFile)
    try {
      val gridIdAndPicdarId = source.getLines().collect {
        case line if line.contains(",") =>
          line.takeWhile(_ != ',') -> line.dropWhile(_ != ',').drop(1)
      }.toList
      val gridIds = gridIdAndPicdarId.map{ case (gridId, _) => gridId }
      val picdarIds = gridIdAndPicdarId.map{ case (_, picdarId) => picdarId }
      if (gridIds.length != gridIds.toSet.size) {
        throw new IllegalArgumentException(s"Picdar CSV file contains duplicate IDs: ${gridIds.length} / ${gridIds.toSet.size} uniques")
      }
      val gridToPicdar = gridIdAndPicdarId.toMap
      //val picdarToGrid = gridIdAndPicdarId.map(_.swap).toMap
      PicdarData(gridToPicdar)
    } finally {
      source.close()
    }
  }

  private def withSourceFromBzipFile[T](file: File)(f: Source => T) = {
    val fileInputStream = new FileInputStream(file)
    val compressInputStream = new BZip2CompressorInputStream(fileInputStream)
    val source = Source.fromInputStream(compressInputStream)
    try {
      f(source)
    } finally {
      source.close()
    }
  }
}
