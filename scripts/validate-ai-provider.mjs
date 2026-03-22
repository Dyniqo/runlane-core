import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';

const env = loadEnvFile('.env');
const provider = readValue('AI_PROVIDER', 'openai_compatible');
const apiKey = readValue('AI_API_KEY', '');
const baseUrl = readValue('AI_BASE_URL', 'https://api.openai.com/v1');
const model = readValue('AI_MODEL', 'gpt-4o-mini');
const timeoutMs = readInteger('AI_TIMEOUT_MS', 30000, 1000, 120000);
const schema = {
  type: 'object',
  properties: {
    route: { type: 'string', enum: ['sales', 'support', 'operations'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string', minLength: 3, maxLength: 240 },
  },
  required: ['route', 'confidence', 'reason'],
  additionalProperties: false,
};

if (provider !== 'openai_compatible') {
  throw new Error(`Unsupported AI_PROVIDER for validation: ${provider}`);
}

validateStructuredOutput(
  {
    route: 'sales',
    confidence: 0.91,
    reason: 'The request asks for a product walkthrough and pricing details.',
  },
  schema,
  '$',
);

if (!apiKey) {
  console.log(
    'AI provider contract validation completed without live request because AI_API_KEY is not configured.',
  );
  process.exit(0);
}

const response = await requestJson({
  url: new URL('chat/completions', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`),
  apiKey,
  timeoutMs,
  body: {
    model,
    messages: [
      {
        role: 'system',
        content: `Return only a valid JSON object that conforms to this JSON schema. Schema: ${JSON.stringify(schema)}`,
      },
      {
        role: 'user',
        content:
          'A buyer asks for pricing, onboarding time and a demo call for a workflow automation backend.',
      },
    ],
    temperature: 0.1,
    max_tokens: 400,
    response_format: { type: 'json_object' },
  },
});

if (response.statusCode < 200 || response.statusCode >= 300) {
  throw new Error(
    `AI provider live validation failed with HTTP ${response.statusCode}: ${JSON.stringify(response.body).slice(0, 500)}`,
  );
}

const content = extractContent(response.body);
const parsed = JSON.parse(stripJsonCodeFence(content));
validateStructuredOutput(parsed, schema, '$');
console.log(`AI provider validation completed with ${baseUrl} using ${model}`);

function loadEnvFile(path) {
  try {
    const values = new Map();
    const content = readFileSync(path, 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      values.set(trimmedLine.slice(0, separatorIndex), trimmedLine.slice(separatorIndex + 1));
    }

    return values;
  } catch {
    return new Map();
  }
}

function readValue(name, defaultValue) {
  return (process.env[name] ?? env.get(name) ?? defaultValue).trim();
}

function readInteger(name, defaultValue, minimum, maximum) {
  const value = Number(readValue(name, String(defaultValue)));

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }

  return value;
}

function requestJson(input) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(input.body), 'utf8');
    const requestFactory = input.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = requestFactory(
      {
        protocol: input.url.protocol,
        hostname: input.url.hostname,
        port: input.url.port ? Number(input.url.port) : input.url.protocol === 'https:' ? 443 : 80,
        path: `${input.url.pathname}${input.url.search}`,
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${input.apiKey}`,
          'content-length': String(body.byteLength),
          'content-type': 'application/json',
          'user-agent': 'Runlane-AiProvider-Validation/1.0',
        },
      },
      (response) => {
        const chunks = [];
        let totalBytes = 0;

        response.on('data', (chunk) => {
          const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += chunkBuffer.byteLength;

          if (totalBytes > 1048576) {
            request.destroy(new Error('AI provider validation response exceeded maximum size'));
            return;
          }

          chunks.push(chunkBuffer);
        });
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8').trim();
          resolve({
            statusCode: response.statusCode ?? 0,
            body: text ? JSON.parse(text) : {},
          });
        });
      },
    );

    request.setTimeout(input.timeoutMs, () =>
      request.destroy(new Error('AI provider validation timed out')),
    );
    request.on('error', (error) => reject(error));
    request.end(body);
  });
}

function extractContent(body) {
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('AI provider live response did not include assistant content');
  }

  return content.trim();
}

function stripJsonCodeFence(value) {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value.trim());
  return match?.[1]?.trim() ?? value.trim();
}

function validateStructuredOutput(value, schemaValue, path) {
  if (schemaValue.type === 'object') {
    if (!isPlainObject(value)) {
      throw new Error(`${path} must be an object`);
    }

    const required = new Set(schemaValue.required ?? []);

    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new Error(`${path}.${key} is required`);
      }
    }

    for (const [key, item] of Object.entries(value)) {
      const childSchema = schemaValue.properties[key];

      if (!childSchema) {
        if (schemaValue.additionalProperties === true) {
          continue;
        }

        throw new Error(`${path}.${key} is not allowed`);
      }

      validateStructuredOutput(item, childSchema, `${path}.${key}`);
    }

    return;
  }

  if (schemaValue.type === 'string') {
    if (typeof value !== 'string') {
      throw new Error(`${path} must be a string`);
    }

    if (schemaValue.enum && !schemaValue.enum.includes(value)) {
      throw new Error(`${path} must be one of ${schemaValue.enum.join(', ')}`);
    }

    if (schemaValue.minLength !== undefined && value.length < schemaValue.minLength) {
      throw new Error(`${path} is too short`);
    }

    if (schemaValue.maxLength !== undefined && value.length > schemaValue.maxLength) {
      throw new Error(`${path} is too long`);
    }

    return;
  }

  if (schemaValue.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${path} must be a number`);
    }

    if (schemaValue.minimum !== undefined && value < schemaValue.minimum) {
      throw new Error(`${path} is below the minimum`);
    }

    if (schemaValue.maximum !== undefined && value > schemaValue.maximum) {
      throw new Error(`${path} exceeds the maximum`);
    }
  }
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
