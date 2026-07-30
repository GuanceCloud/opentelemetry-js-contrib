'use strict';

const {
  endpoints,
  profiling,
  settings,
  service,
  startTelemetry,
  shutdownTelemetry,
} = require('./otel');
const express = require('express');
const axios = require('axios').default;
const { metrics, trace, SpanStatusCode } = require('@opentelemetry/api');

const PORT = Number(process.env.DEMO_PORT || '18080');
const tracer = trace.getTracer('guance-nodejs-demo-app', service.version);
const retainedAllocations = [];
const app = express();

let workCounter;
let workDuration;
let allocatedBytes;
let inFlightGaugeState;

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/__summary', (_req, res) => {
  res.json({
    ok: true,
    endpoints,
    port: PORT,
    profileTypes: settings.profileTypes,
    service,
  });
});

app.get('/downstream', async (req, res) => {
  const pauseMs = Math.max(5, Number(req.query.pauseMs || '40'));
  await sleep(pauseMs);
  res.json({
    ok: true,
    pauseMs,
  });
});

app.get('/work', async (req, res) => {
  const cpuMs = Math.max(50, Number(req.query.cpuMs || '180'));
  const allocMb = Math.max(4, Number(req.query.allocMb || '12'));
  const pauseMs = Math.max(20, Number(req.query.pauseMs || '80'));
  const route = '/work';
  const start = Date.now();
  inFlightGaugeState.count += 1;

  await tracer.startActiveSpan('demo.business', async span => {
    try {
      burnCpu(cpuMs);
      retainAllocation(allocMb);
      await axios.get(`http://127.0.0.1:${PORT}/downstream`, {
        params: { pauseMs },
      });

      const durationMs = Date.now() - start;
      const context = span.spanContext();

      workCounter.add(1, { route });
      workDuration.record(durationMs, { route });
      allocatedBytes.record(allocMb * 1024 * 1024, { route });

      span.setAttribute('demo.cpu_ms', cpuMs);
      span.setAttribute('demo.alloc_mb', allocMb);
      span.setAttribute('demo.pause_ms', pauseMs);
      span.setStatus({ code: SpanStatusCode.OK });

      res.json({
        ok: true,
        route,
        cpuMs,
        allocMb,
        pauseMs,
        durationMs,
        traceId: context.traceId,
        spanId: context.spanId,
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      res.status(500).json({
        ok: false,
        error: error.message,
      });
    } finally {
      inFlightGaugeState.count -= 1;
      span.end();
    }
  });
});

app.post('/__collect-profile', async (_req, res) => {
  try {
    await profiling.collectOnce();
    res.json({
      ok: true,
      profileEndpoint: endpoints.profile,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

async function main() {
  await startTelemetry();
  initMetrics();
  const server = await listen(app, PORT);

  console.log(`[demo] service started at http://127.0.0.1:${PORT}`);
  console.log(`[demo] trace endpoint   : ${endpoints.trace}`);
  console.log(`[demo] metric endpoint  : ${endpoints.metric}`);
  console.log(`[demo] profile endpoint : ${endpoints.profile}`);

  const shutdown = async signal => {
    console.log(`[demo] received ${signal}, shutting down`);
    await closeServer(server);
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

function initMetrics() {
  const meter = metrics.getMeter('guance-nodejs-demo-meter', service.version);
  inFlightGaugeState = { count: 0 };
  workCounter = meter.createCounter('demo_work_requests_total', {
    description: 'Total number of /work requests handled by the demo',
  });
  workDuration = meter.createHistogram('demo_work_duration_ms', {
    description: 'End-to-end duration of /work requests',
    unit: 'ms',
  });
  allocatedBytes = meter.createHistogram('demo_allocated_bytes', {
    description: 'Approximate bytes retained per /work request',
    unit: 'By',
  });
  meter.createObservableGauge('demo_inflight_requests', {
    description: 'Current number of in-flight /work requests',
  }, observableResult => {
    observableResult.observe(inFlightGaugeState.count);
  });
}

function burnCpu(durationMs) {
  const stopAt = Date.now() + durationMs;
  let value = 0;
  while (Date.now() < stopAt) {
    value += Math.sqrt(value + 11) % 7;
  }
  return value;
}

function retainAllocation(allocMb) {
  const blockSize = 1024 * 1024;
  const blocks = [];
  for (let i = 0; i < allocMb; i += 1) {
    blocks.push(Buffer.alloc(blockSize, i % 255));
  }
  retainedAllocations.push(blocks);
  while (retainedAllocations.length > 3) {
    retainedAllocations.shift();
  }
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function listen(serverApp, port) {
  return new Promise((resolve, reject) => {
    const server = serverApp.listen(port, error => {
      if (error) {
        reject(error);
        return;
      }
      resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

main().catch(error => {
  console.error('[demo] failed to start demo app:', error);
  process.exit(1);
});
