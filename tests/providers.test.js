import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenAIResponsesPayload,
  buildOpenAIChatPayload,
  parseOpenAIResponsesResult
} from '../src/providers/openai.js';
import {
  buildGoogleGenerateContentPayload,
  buildGoogleInteractionsPayload,
  callGoogle,
  parseGoogleResult
} from '../src/providers/google.js';
import { extractJsonObject, pickStageProvider, resolveGatewaySettings } from '../src/providers/index.js';

test('OpenAI Responses payload uses gpt-6.2-sol + high effort + developer cache prefix and never sends none/temperature', () => {
  const payload = buildOpenAIResponsesPayload({
    model: 'gpt-6.2-sol',
    reasoningEffort: 'high',
    systemPrompt: '你是导演 Agent',
    userPrompt: '写脚本',
    jsonMode: true
  });

  assert.equal(payload.model, 'gpt-6.2-sol');
  assert.equal(payload.reasoning.effort, 'high');
  assert.equal(payload.input[0].role, 'developer');
  assert.equal(payload.input[1].role, 'user');
  assert.equal(payload.text.format.type, 'json_object');
  assert.equal('temperature' in payload, false);
  assert.equal('top_p' in payload, false);

  // Guard against rejected reasoning effort "none"
  const safeNone = buildOpenAIResponsesPayload({ reasoningEffort: 'none', userPrompt: 'hi' });
  assert.equal(safeNone.reasoning.effort, 'low');

  const chatPayload = buildOpenAIChatPayload({ model: 'gpt-6.2-sol', reasoningEffort: 'high', userPrompt: 'hi' });
  assert.equal(chatPayload.reasoning_effort, 'high');
  assert.equal('temperature' in chatPayload, false);
});

test('OpenAI Responses parser extracts visible output_text, reasoning summary, and reasoning_tokens', () => {
  const parsed = parseOpenAIResponsesResult({
    status: 'completed',
    output: [
      { type: 'reasoning', summary: [{ type: 'summary_text', text: '先测算时长再分配镜头。' }] },
      { type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }
    ],
    usage: {
      input_tokens: 500,
      input_tokens_details: { cached_tokens: 200 },
      output_tokens: 800,
      output_tokens_details: { reasoning_tokens: 450 },
      total_tokens: 1300
    }
  });

  assert.equal(parsed.text, '{"ok":true}');
  assert.match(parsed.thoughtSummary, /先测算时长/);
  assert.equal(parsed.usage.reasoningTokens, 450);
  assert.equal(parsed.usage.cachedTokens, 200);
});

test('Google generateContent & Interactions payloads follow Gemini 4 Neon spec (high, no thinkingBudget, no sampling params)', () => {
  const gc = buildGoogleGenerateContentPayload({
    systemPrompt: '你是制片人',
    userPrompt: '生成6个创意',
    thinkingLevel: 'high',
    jsonMode: true
  });

  assert.equal(gc.generationConfig.thinkingConfig.thinkingLevel, 'high');
  assert.equal(gc.generationConfig.maxOutputTokens, 65536);
  assert.equal(gc.generationConfig.responseMimeType, 'application/json');
  assert.equal('thinkingBudget' in gc.generationConfig.thinkingConfig, false);
  assert.equal('temperature' in gc.generationConfig, false);
  assert.equal('topP' in gc.generationConfig, false);

  // Guard against rejected "minimal"
  const safeMin = buildGoogleGenerateContentPayload({ thinkingLevel: 'minimal', userPrompt: 'hi' });
  assert.equal(safeMin.generationConfig.thinkingConfig.thinkingLevel, 'low');

  // Interactions API payload
  const inter = buildGoogleInteractionsPayload({
    model: 'gemini-4-neon',
    systemPrompt: 'system',
    userPrompt: 'user',
    thinkingLevel: 'high'
  });
  assert.equal(inter.model, 'gemini-4-neon');
  assert.equal(inter.generation_config.thinking_level, 'high');
  assert.equal(inter.store, false);
});

test('Google parser handles both generateContent (separating thought parts) and Interactions API', () => {
  const gc = parseGoogleResult({
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            { thought: true, text: '内部思考链路' },
            { text: '{"recommendedSeconds":45}' }
          ]
        }
      }
    ],
    usageMetadata: {
      promptTokenCount: 300,
      candidatesTokenCount: 150,
      thoughtsTokenCount: 400,
      totalTokenCount: 850
    }
  });
  assert.equal(gc.text, '{"recommendedSeconds":45}');
  assert.equal(gc.thoughtSummary, '内部思考链路');
  assert.equal(gc.usage.reasoningTokens, 400);

  const inter = parseGoogleResult({
    status: 'completed',
    steps: [
      { type: 'thought', content: [{ type: 'text', text: '分析叙事结构' }] },
      { type: 'model_output', content: [{ type: 'text', text: '{"ideas":[' }] },
      { type: 'model_output', content: [{ type: 'text', text: ']}' }] }
    ],
    usage: {
      total_input_tokens: 200,
      total_output_tokens: 100,
      total_thought_tokens: 350,
      total_tokens: 650
    }
  });
  assert.equal(inter.text, '{"ideas":[]}');
  assert.equal(inter.usage.reasoningTokens, 350);
});

test('Hybrid routing dispatches ideation to Google Neon and script architecture to OpenAI Sol', () => {
  const gateway = resolveGatewaySettings(
    { mode: 'hybrid' },
    { 'x-openai-api-key': 'sk-test', 'x-google-api-key': 'AIza-test' }
  );

  const stage1 = pickStageProvider(gateway, 'duration_mapper');
  const stage2 = pickStageProvider(gateway, 'idea_generator');
  const stage3 = pickStageProvider(gateway, 'script_architect');
  const stage4 = pickStageProvider(gateway, 'shootability_reviewer');

  assert.equal(stage1.provider, 'google');
  assert.equal(stage1.model, 'gemini-4-neon');
  assert.equal(stage1.reasoningLevel, 'high');

  assert.equal(stage2.provider, 'google');
  assert.equal(stage3.provider, 'openai');
  assert.equal(stage3.model, 'gpt-6.2-sol');
  assert.equal(stage3.reasoningLevel, 'high');
  assert.equal(stage4.provider, 'openai');
});

test('extractJsonObject parses markdown-fenced and prose-wrapped JSON cleanly', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('好的，结果如下：{"b":"ok"} 谢谢'), { b: 'ok' });
});

test('Gemini server credentials use only the configured Google endpoint', (t) => {
  const { GEMINI_API_KEY, GEMINI_BASE_URL } = process.env;
  t.after(() => {
    for (const [name, value] of Object.entries({ GEMINI_API_KEY, GEMINI_BASE_URL })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const vertex = 'https://aiplatform.googleapis.com/v1/projects/demo/locations/global/publishers/google';
  const custom = 'https://client.example/v1';
  process.env.GEMINI_API_KEY = 'test-server';
  process.env.GEMINI_BASE_URL = vertex;
  const override = { google: { baseUrl: custom } };
  const server = resolveGatewaySettings(override).google;
  assert.equal(server.keySource, 'server');
  assert.equal(server.baseUrl, vertex);
  assert.equal(resolveGatewaySettings(override, { 'x-google-api-key': '   ' }).google.baseUrl, vertex);

  for (const guest of [
    resolveGatewaySettings(override, { 'x-google-api-key': 'test-guest' }).google,
    resolveGatewaySettings({ google: { baseUrl: custom, apiKey: 'test-guest' } }).google
  ]) {
    assert.equal(guest.apiKey, 'test-guest');
    assert.equal(guest.baseUrl, custom);
  }
  for (const invalid of [custom, 'http://generativelanguage.googleapis.com/v1beta']) {
    process.env.GEMINI_BASE_URL = invalid;
    assert.throws(() => resolveGatewaySettings(), /Google HTTPS/);
  }
});

test('Gemini transport disables redirects for both protocols', async (t) => {
  const transport = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return Response.json({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  });
  for (const protocol of ['generate_content', 'interactions']) {
    await callGoogle({ apiKey: 'test-only', protocol, userPrompt: 'ping' });
  }
  assert.equal(transport.mock.callCount(), 2);
});
