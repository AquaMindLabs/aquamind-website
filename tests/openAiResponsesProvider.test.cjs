const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createOpenAiResponsesProvider,
  shouldReturnProviderFallback,
} = require('../scripts/ai-backend-core.cjs');

test('OpenAI Responses provider uses low reasoning and enough output tokens for gpt-5', async () => {
  const originalFetch = global.fetch;
  let requestBody = null;

  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(String(options?.body ?? '{}'));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          status: 'completed',
          output: [
            { type: 'reasoning', summary: [] },
            {
              type: 'message',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    answer: 'pong',
                    recommendations: ['ok'],
                    warnings: [],
                  }),
                },
              ],
            },
          ],
        };
      },
    };
  };

  try {
    const provider = createOpenAiResponsesProvider({
      apiKey: 'test-key',
      model: 'gpt-5-mini',
    });

    const result = await provider.generateChat({
      request: { question: 'ping', additionalInfo: '', mode: 'general', locale: 'pl' },
      contextSummary: {},
    });

    assert.equal(result.answer, 'pong');
    assert.equal(requestBody.max_output_tokens, 2400);
    assert.deepEqual(requestBody.reasoning, { effort: 'minimal' });
    assert.equal(requestBody.text.format.type, 'json_object');
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI Responses provider preserves fetch failure details', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => {
    const error = new TypeError('fetch failed');
    error.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
    throw error;
  };

  try {
    const provider = createOpenAiResponsesProvider({
      apiKey: 'test-key',
      model: 'gpt-5-mini',
    });

    await assert.rejects(
      () =>
        provider.generateChat({
          request: {
            question: 'ping',
            additionalInfo: '',
            mode: 'general',
            locale: 'pl',
          },
          contextSummary: {},
        }),
      (error) => {
        assert.equal(error.code, 'AIW_PROVIDER_ERROR');
        assert.equal(error.httpStatus, 502);
        assert.equal(error.providerHttpStatus, 0);
        assert.equal(error.providerErrorType, 'TypeError');
        assert.equal(error.providerErrorCode, 'UND_ERR_CONNECT_TIMEOUT');
        assert.equal(error.providerErrorMessage, 'fetch failed');
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('OpenAI provider errors are eligible for local fallback', () => {
  assert.equal(
    shouldReturnProviderFallback({
      providerName: 'openai',
      mappedError: { code: 'AIW_PROVIDER_ERROR' },
      requestForProvider: { question: 'ping' },
      contextSummary: {},
    }),
    true
  );
});
