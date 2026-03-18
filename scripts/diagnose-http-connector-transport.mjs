import { lookup, resolve4, resolve6 } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { constants as cryptoConstants } from 'node:crypto';
import os from 'node:os';
import process from 'node:process';

const targetUrl = new URL(
  process.argv[2] || process.env.RUNLANE_HTTP_CONNECTOR_TEST_URL || 'https://httpbingo.org/post',
);
const timeoutMs = readPositiveInteger(
  process.env.RUNLANE_HTTP_CONNECTOR_DIAGNOSTIC_TIMEOUT_MS,
  10000,
);
const requestBody = Buffer.from(
  JSON.stringify({ diagnostic: true, source: 'runlane-http-connector', timestamp: Date.now() }),
  'utf8',
);
const port = Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));

await main();

async function main() {
  write('diagnostic.started', {
    targetUrl: maskUrl(targetUrl),
    timeoutMs,
    nodeVersion: process.version,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    httpProxyConfigured: Boolean(process.env.HTTP_PROXY || process.env.http_proxy),
    httpsProxyConfigured: Boolean(process.env.HTTPS_PROXY || process.env.https_proxy),
    noProxy: process.env.NO_PROXY || process.env.no_proxy || '',
  });

  const addresses = await diagnoseDns(targetUrl.hostname);

  for (const record of addresses) {
    await diagnoseTcp(record.address, record.family);

    if (targetUrl.protocol === 'https:') {
      await diagnoseTls(record.address, record.family);
    }

    await diagnoseNodeRequest(`node-request-address-${record.family}-${record.address}`, {
      lookupAddress: record.address,
      lookupFamily: record.family,
    });
  }

  await diagnoseNodeRequest('node-request-default', {});
  await diagnoseFetch();
  write('diagnostic.completed', { targetUrl: maskUrl(targetUrl) });
}

async function diagnoseDns(hostname) {
  const addresses = [];

  try {
    const records = await lookup(hostname, { all: true, verbatim: false });
    for (const record of records) {
      addresses.push({ address: record.address, family: record.family });
    }
    write('dns.lookup.success', { records: addresses });
  } catch (error) {
    write('dns.lookup.error', { error: serializeError(error) });
  }

  try {
    const records = await resolve4(hostname);
    write('dns.resolve4.success', { records });
  } catch (error) {
    write('dns.resolve4.error', { error: serializeError(error) });
  }

  try {
    const records = await resolve6(hostname);
    write('dns.resolve6.success', { records });
  } catch (error) {
    write('dns.resolve6.error', { error: serializeError(error) });
  }

  return [
    ...new Map(addresses.map((record) => [`${record.family}:${record.address}`, record])).values(),
  ];
}

async function diagnoseTcp(address, family) {
  const startedAt = Date.now();
  let settled = false;

  await new Promise((resolve) => {
    const socket = netConnect({ host: address, port, family });
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      write('tcp.error', {
        address,
        family,
        port,
        durationMs: Date.now() - startedAt,
        error: { name: 'TimeoutError', message: 'TCP connection timed out' },
      });
      resolve();
    }, timeoutMs);

    socket.once('connect', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      write('tcp.success', { address, family, port, durationMs: Date.now() - startedAt });
      resolve();
    });

    socket.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      write('tcp.error', {
        address,
        family,
        port,
        durationMs: Date.now() - startedAt,
        error: serializeError(error),
      });
      resolve();
    });
  });
}

async function diagnoseTls(address, family) {
  const startedAt = Date.now();
  let settled = false;

  await new Promise((resolve) => {
    const socket = tlsConnect({
      host: address,
      port,
      servername: targetUrl.hostname,
      minVersion: 'TLSv1.2',
      secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
    });
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      write('tls.error', {
        address,
        family,
        port,
        durationMs: Date.now() - startedAt,
        error: { name: 'TimeoutError', message: 'TLS handshake timed out' },
      });
      resolve();
    }, timeoutMs);

    socket.once('secureConnect', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const certificate = socket.getPeerCertificate(false);
      write('tls.success', {
        address,
        family,
        port,
        durationMs: Date.now() - startedAt,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError || null,
        alpnProtocol: socket.alpnProtocol || null,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name || null,
        certificateSubject:
          certificate && typeof certificate === 'object' ? certificate.subject : null,
        certificateIssuer:
          certificate && typeof certificate === 'object' ? certificate.issuer : null,
      });
      socket.destroy();
      resolve();
    });

    socket.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      write('tls.error', {
        address,
        family,
        port,
        durationMs: Date.now() - startedAt,
        error: serializeError(error),
      });
      resolve();
    });
  });
}

async function diagnoseNodeRequest(label, input) {
  const startedAt = Date.now();
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    'content-length': String(requestBody.byteLength),
    'user-agent': 'Runlane-HttpConnector-Diagnostic/1.0',
  };

  await new Promise((resolve) => {
    const requestOptions = {
      method: 'POST',
      headers,
      timeout: timeoutMs,
      ...(input.lookupAddress
        ? {
            lookup: (hostname, options, callback) => {
              write('node-request.lookup', {
                label,
                requestedHostname: hostname,
                requestedOptions: sanitizeLookupOptions(options),
                selectedAddress: input.lookupAddress,
                selectedFamily: input.lookupFamily,
              });

              if (options && typeof options === 'object' && options.all === true) {
                callback(null, [{ address: input.lookupAddress, family: input.lookupFamily }]);
                return;
              }

              callback(null, input.lookupAddress, input.lookupFamily);
            },
          }
        : {}),
    };
    const client = targetUrl.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = client(targetUrl, requestOptions, (res) => {
      const chunks = [];
      let totalBytes = 0;
      res.on('data', (chunk) => {
        totalBytes += chunk.byteLength;
        if (totalBytes <= 16384) {
          chunks.push(chunk);
        }
      });
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        write('node-request.response', {
          label,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
          headers: pickHeaders(res.headers),
          bodyPreview: body.slice(0, 700),
        });
        resolve();
      });
    });

    req.on('socket', (socket) => {
      socket.on('lookup', (error, address, family, hostname) => {
        write('node-request.socket.lookup', {
          label,
          hostname,
          address: address || null,
          family: family || null,
          error: error ? serializeError(error) : null,
          durationMs: Date.now() - startedAt,
        });
      });
      socket.on('connect', () => {
        write('node-request.socket.connect', {
          label,
          remoteAddress: socket.remoteAddress || null,
          remoteFamily: socket.remoteFamily || null,
          remotePort: socket.remotePort || null,
          localAddress: socket.localAddress || null,
          localPort: socket.localPort || null,
          durationMs: Date.now() - startedAt,
        });
      });
      socket.on('secureConnect', () => {
        write('node-request.socket.secureConnect', {
          label,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError || null,
          alpnProtocol: socket.alpnProtocol || null,
          protocol: typeof socket.getProtocol === 'function' ? socket.getProtocol() : null,
          cipher: typeof socket.getCipher === 'function' ? socket.getCipher()?.name || null : null,
          durationMs: Date.now() - startedAt,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Node request timed out'));
    });

    req.on('error', (error) => {
      write('node-request.error', {
        label,
        durationMs: Date.now() - startedAt,
        error: serializeError(error),
      });
      resolve();
    });

    req.write(requestBody);
    req.end();
  });
}

async function diagnoseFetch() {
  if (typeof fetch !== 'function') {
    write('fetch.skipped', { reason: 'fetch is not available in this Node.js runtime' });
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'Runlane-HttpConnector-Diagnostic/1.0',
      },
      body: requestBody,
      signal: controller.signal,
      redirect: 'manual',
    });
    const text = await response.text();
    write('fetch.response', {
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      headers: pickFetchHeaders(response.headers),
      bodyPreview: text.slice(0, 700),
    });
  } catch (error) {
    write('fetch.error', { durationMs: Date.now() - startedAt, error: serializeError(error) });
  } finally {
    clearTimeout(timer);
  }
}

function write(event, payload) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...payload,
    }),
  );
}

function serializeError(error) {
  if (!error || typeof error !== 'object') {
    return { name: 'UnknownError', message: String(error) };
  }

  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code || null,
    errno: error.errno || null,
    syscall: error.syscall || null,
    address: error.address || null,
    port: error.port || null,
    cause: error.cause ? serializeError(error.cause) : null,
  };
}

function maskUrl(url) {
  const clone = new URL(url.href);
  clone.username = '';
  clone.password = '';
  return clone.href;
}

function pickHeaders(headers) {
  const selected = {};
  for (const name of ['content-type', 'content-length', 'server', 'via', 'location']) {
    const value = headers[name];
    if (value !== undefined) {
      selected[name] = Array.isArray(value) ? value.join(',') : String(value);
    }
  }
  return selected;
}

function pickFetchHeaders(headers) {
  const selected = {};
  for (const name of ['content-type', 'content-length', 'server', 'via', 'location']) {
    const value = headers.get(name);
    if (value !== null) {
      selected[name] = value;
    }
  }
  return selected;
}

function sanitizeLookupOptions(options) {
  if (!options || typeof options !== 'object') {
    return options;
  }

  return {
    all: Boolean(options.all),
    family: typeof options.family === 'number' ? options.family : null,
    hints: typeof options.hints === 'number' ? options.hints : null,
    verbatim: typeof options.verbatim === 'boolean' ? options.verbatim : null,
  };
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
