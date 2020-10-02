# API Response examples

## Usage (by media id)

`GET https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060331`

```json
{
  "uri": "https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060331",
  "length": 1,
  "data": [
    {
      "uri": "https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
      "data": {
        "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
        "references": [
          {
            "type": "frontend",
            "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5"
          },
          {
            "type": "composer",
            "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
          }
        ],
        "platform": "digital",
        "media": "image",
        "status": "pending",
        "digitalUsageMetadata": {
            "webTitle": "Headline",
            "webUrl": "http://www.example.com/culture/2015/dec/02/headline",
            "sectionId": "culture",
            "composerUrl": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
        },
        "dateAdded": "2015-11-27T15:56:51Z",
        "lastModified": "2015-11-30T12:07:14Z"
      }
    }
  ],
  "links": [
    {
      "rel": "media",
      "href": "https://api.media.tools.example.com/images/53b2098571e4e9f1d22e98b74db9a8bc5d060331"
    }
  ]
}
```

## Usage (by usage id)

`GET https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735`

```json
{
  "uri": "https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
  "data": {
    "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
    "references": [
      {
        "type": "frontend",
        "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5",
        "name": "Some Headline"
      },
      {
        "type": "composer",
        "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
      }
    ],
    "platform": "digital",
    "media": "image",
    "status": "pending",
    "digitalUsageMetadata": {
        "webTitle": "Headline",
        "webUrl": "http://www.example.com/culture/2015/dec/02/headline",
        "sectionId": "culture",
        "composerUrl": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
    },
    "dateAdded": "2015-11-27T15:56:51Z",
    "lastModified": "2015-11-30T12:07:14Z"
  },
  "links": [
    {
      "rel": "media",
      "href": "https://api.media.tools.example.com/images/53b2098571e4e9f1d22e98b74db9a8bc5d060331"
    },
    {
      "rel": "media-usage",
      "href": "https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060331"
    }
  ]
}
```

## Elasticsearch

`GET http://localhost:9200/images/image/53b2098571e4e9f1d22e98b74db9a8bc5d060331 `

```json
{
  "_source": {
    "usages": [
      {
        "isRemoved": false,
        "references": [
          {
            "type": "frontend",
            "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5"
          },
          {
            "type": "composer",
            "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
          }
        ],
        "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
        "lastModified": "2015-11-30T12:07:11Z",
        "media": "image",
        "dateAdded": "2015-11-27T15:56:51Z",
        "platform": "digital",
        "status": "pending",
        "digitalUsageMetadata": {
            "webTitle": "Headline",
            "webUrl": "http://www.example.com/culture/2015/dec/02/headline",
            "sectionId": "culture",
            "composerUrl": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
        }
      }
    ]
  }
}
```

## Media Api

`GET https://api.media.tools.example.com/images/53b2098571e4e9f1d22e98b74db9a8bc5d060331`

```json
{
  "data": {
    "usages": {
      "uri": "https://media-usage.tools.example.com/usages/media/53b2098571e4e9f1d22e98b74db9a8bc5d060331",
      "data": [
        {
          "uri": "https://media-usage.tools.example.com/usages/composer%2F56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
          "data": {
            "id": "composer/56587d29e4b0fe4d55bb97d5_87ad7407a9caef288eb1d34c16cc4735",
            "references": [
              {
                "type": "frontend",
                "uri": "http://www.example.com/global/56587d29e4b0fe4d55bb97d5"
              },
              {
                "type": "composer",
                "uri": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
              }
            ],
            "platform": "digital",
            "media": "image",
            "status": "pending",
            "digitalUsageMetadata": {
                "webTitle": "Headline",
                "webUrl": "http://www.example.com/culture/2015/dec/02/headline",
                "sectionId": "culture",
                "composerUrl": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
            },
            "dateAdded": "2015-11-27T15:56:51Z",
            "lastModified": "2015-11-30T12:07:11Z"
          }
        }
      ]
    },
    "...": "..."
  },
  "...": "..."
}
```

## Usage Status

Status can be either `removed`, `pending` or `published`.

The rules for displaying a particular status are as follow:

Matching usages are defined as those with the same `grouping` and `media_id` but different `usage_id`

* If there exists a `pending` usage but no matching `published` or `removed` usages, `pending` is reported.
* If there are matching `pending` and `published` usages, only `published` is reported.
* It there are matching `removed` usages only `published` usages are reported (hiding pending usages).

## Usage Metadata

Usage records can have `digitalUsageMetadata` or `printUsageMetadata`.

### Digital

`composerUrl` is the only optional field.

```
{
    "...",
    "digitalUsageMetadata": {
        "webTitle": "Headline",
        "webUrl": "http://www.example.com/culture/2015/dec/02/headline",
        "sectionId": "culture",
        "composerUrl": "https://composer.tools.example.com/content/56587d29e4b0fe4d55bb97d5"
    }
}
```

### Print

All fields are required.

```
{
    "...",
    "printUsageMetadata": {
        "sectionName": "Grauniad Weekly Test",
        "issueDate": "2014-07-25T15:30:00Z",
        "pageNumber": 1,
        "storyName": "NWPalLoad",
        "publicationCode": "gdn",
        "publicationName": "The Grauniad",
        "layoutId": 10884608,
        "edition": 1,
        "size": {
            "x": 70,
            "y": 82
        },
        "orderedBy": "Davina Bloshen",
        "sectionCode": "gnd"
    }
}
```
