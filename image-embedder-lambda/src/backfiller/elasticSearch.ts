export interface ElasticSearchResponse {
  hits: [
    {
      _id: string,
      _source: {
        source: {
          file: string
          mimeType: string
        }
      }
    }
  ]
}


export const queryElasticSearch = async (batchSize: number, elasticSearchUrl: string): Promise<ElasticSearchResponse> => {
  const query = {
    query: {
      function_score: {
        query: {
          bool: {
            must_not: {exists: {field: "embedding.cohereEmbedEnglishV3.image"}}
          }
        },
        random_score: {seed: "<lambda_invocation_id>", field: "_seq_no"},
        boost_mode: "replace"
      }
    },
    size: batchSize
  }

  const response = await fetch(`${elasticSearchUrl}/Images_Current/_search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  });

  return await response.json() as ElasticSearchResponse;
}

