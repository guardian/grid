export interface ElasticSearchHit {
  _id: string,
  _source: {
    source: {
      file: string
      mimeType: string
    }
  }
}

export interface ElasticSearchSuccess {
  hits: {
    hits: ElasticSearchHit[],
  },
  kind: 'success',
}

export interface ElasticSearchError {
  error: {
    root_cause: any,
    type: string,
    reason: string,
  },
  status: number,
  kind: 'error',
}

export type ElasticSearchResponse = ElasticSearchSuccess | ElasticSearchError;

const parseElasticSearchResponse = (response: any): ElasticSearchResponse => {
  if (response.error) {
    return {kind: 'error', ...response} as ElasticSearchError;
  } else {
    return {kind: 'success', ...response} as ElasticSearchSuccess
  }
}


export const queryElasticSearch = async (
  batchSize: number,
  elasticSearchUrl: string,
  elasticSearchIndexName: string,
  seed: string = 'test-seed'
): Promise<ElasticSearchResponse> => {
  const query = {
    query: {
      function_score: {
        query: {
          bool: {
            must_not: [
              {exists: {field: "embedding.cohereEmbedEnglishV3.image"}},
              {exists: {field: "softDeletedMetadata"}}
            ]
          }
        },
        random_score: {seed: seed, field: "_seq_no"},
        boost_mode: "replace"
      }
    },
    size: batchSize
  }

  const url = `${elasticSearchUrl}/${elasticSearchIndexName}/_search`;
  const payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  };
  console.debug(`About to call ES on ${url} with ${payload}`);
  const response = await fetch(url, payload);

  return parseElasticSearchResponse(await response.json());
}


