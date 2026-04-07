import {queryElasticSearch} from '../../src/backfiller/elasticSearch';

const ELASTIC_SEARCH_URL = 'http://localhost:9200';
const IMAGE_INDEX_NAME = 'test-index';

function mockFetch(status: number, body: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({
    json: jest.fn().mockResolvedValue(body),
    status,
  } as unknown as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('queryElasticSearch', () => {
  it('returns a success response when ElasticSearch returns hits', async () => {
    const esBody = {
      hits: {
        hits: [
          {
            _id: 'abc123',
            _source: {
              source: {
                file: 'https://my-bucket.s3.amazonaws.com/images/abc123',
                mimeType: 'image/jpeg',
              },
            },
          },
        ],
      },
    };
    mockFetch(200, esBody);

    const result = await queryElasticSearch(10, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME);

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.hits.hits).toHaveLength(1);
      expect(result.hits.hits[0]._id).toBe('abc123');
    }
  });

  it('returns an error response when ElasticSearch returns an error', async () => {
    const esBody = {
      error: {
        root_cause: [],
        type: 'index_not_found_exception',
        reason: 'no such index',
      },
      status: 404,
    };
    mockFetch(404, esBody);

    const result = await queryElasticSearch(10, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME);

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.error.type).toBe('index_not_found_exception');
      expect(result.status).toBe(404);
    }
  });

  it('posts to the correct URL', async () => {
    mockFetch(200, {hits: {hits: []}});

    await queryElasticSearch(50, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME);

    expect(global.fetch).toHaveBeenCalledWith(
      `${ELASTIC_SEARCH_URL}/${IMAGE_INDEX_NAME}/_search`,
      expect.objectContaining({method: 'POST'}),
    );
  });

  it('includes the batch size in the query body', async () => {
    mockFetch(200, {hits: {hits: []}});

    await queryElasticSearch(42, ELASTIC_SEARCH_URL, IMAGE_INDEX_NAME);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.size).toBe(42);
  });

});

