'use strict';

const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  PeriodicExportingMetricReader,
} = require('@opentelemetry/sdk-metrics');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-proto');
const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-proto');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const {
  ExpressInstrumentation,
} = require('@opentelemetry/instrumentation-express');
const {
  RuntimeNodeInstrumentation,
} = require('@opentelemetry/instrumentation-runtime-node');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} = require('@opentelemetry/semantic-conventions');
const {
  NodeProfiling,
  DatakitProfilingExporter,
} = require('@cloudcare/profiler-nodejs');

const OTEL_DIAG_LEVEL = process.env.OTEL_DIAG_LEVEL || 'ERROR';
const OTLP_BASE_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:9529/otel';
const TRACE_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  process.env.TRACE_ENDPOINT ||
  appendPath(OTLP_BASE_ENDPOINT, 'v1/traces');
const METRIC_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
  process.env.METRIC_ENDPOINT ||
  appendPath(OTLP_BASE_ENDPOINT, 'v1/metrics');
const PROFILE_ENDPOINT =
  process.env.PROFILE_ENDPOINT ||
  'http://127.0.0.1:9529/profiling/v1/input';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'guance-nodejs-demo';
const SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '0.1.0';
const DEPLOYMENT_ENV =
  process.env.DEPLOYMENT_ENVIRONMENT || 'local-demo';
const METRIC_EXPORT_INTERVAL_MS = Number(
  process.env.METRIC_EXPORT_INTERVAL_MS || '5000'
);
const METRIC_EXPORT_TIMEOUT_MS = Math.max(
  1000,
  Math.min(
    Number(process.env.METRIC_EXPORT_TIMEOUT_MS || '3000'),
    METRIC_EXPORT_INTERVAL_MS
  )
);
const PROFILE_INTERVAL_MS = Number(process.env.PROFILE_INTERVAL_MS || '15000');
const PROFILE_WALL_DURATION_MS = Number(
  process.env.PROFILE_WALL_DURATION_MS || '4000'
);
const PROFILE_TYPES = (process.env.PROFILE_TYPES || 'wall')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

process.env.OTEL_LOGS_EXPORTER = process.env.OTEL_LOGS_EXPORTER || 'none';

const diagLevels = {
  ALL: DiagLogLevel.ALL,
  VERBOSE: DiagLogLevel.VERBOSE,
  DEBUG: DiagLogLevel.DEBUG,
  INFO: DiagLogLevel.INFO,
  WARN: DiagLogLevel.WARN,
  ERROR: DiagLogLevel.ERROR,
  NONE: DiagLogLevel.NONE,
};

diag.setLogger(
  new DiagConsoleLogger(),
  diagLevels[OTEL_DIAG_LEVEL.toUpperCase()] ?? DiagLogLevel.ERROR
);

function isCollectorRequest(input) {
  if (!input) {
    return false;
  }

  let url;
  if (typeof input === 'string') {
    url = input;
  } else if (typeof input.href === 'string') {
    url = input.href;
  } else if (typeof input.protocol === 'string') {
    const host = input.hostname || input.host;
    const path = input.path || input.pathname || '';
    url = `${input.protocol}//${host}${path}`;
  }

  if (!url) {
    return false;
  }

  return (
    url.includes('/otel/v1/traces') ||
    url.includes('/otel/v1/metrics') ||
    url.includes('/profiling/v1/input')
  );
}

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: DEPLOYMENT_ENV,
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter({
    url: TRACE_ENDPOINT,
  }),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: METRIC_ENDPOINT,
      }),
      exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
      exportTimeoutMillis: METRIC_EXPORT_TIMEOUT_MS,
    }),
  ],
  instrumentations: [
    new HttpInstrumentation({
      ignoreOutgoingRequestHook(request) {
        return isCollectorRequest(request);
      },
    }),
    new ExpressInstrumentation(),
    new RuntimeNodeInstrumentation({
      monitoringPrecision: 1000,
    }),
  ],
});

const profiling = new NodeProfiling({
  exporter: new DatakitProfilingExporter({
    endpoint: PROFILE_ENDPOINT,
  }),
  serviceName: SERVICE_NAME,
  serviceVersion: SERVICE_VERSION,
  deploymentEnvironment: DEPLOYMENT_ENV,
  profileTypes: PROFILE_TYPES,
  intervalMillis: PROFILE_INTERVAL_MS,
  wallDurationMillis: PROFILE_WALL_DURATION_MS,
});

let started = false;

async function startTelemetry() {
  if (started) {
    return;
  }

  await sdk.start();
  await profiling.start();
  started = true;
}

async function shutdownTelemetry() {
  if (!started) {
    return;
  }

  await profiling.shutdown();
  await sdk.shutdown();
  started = false;
}

function appendPath(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

module.exports = {
  endpoints: {
    otlpBase: OTLP_BASE_ENDPOINT,
    trace: TRACE_ENDPOINT,
    metric: METRIC_ENDPOINT,
    profile: PROFILE_ENDPOINT,
  },
  profiling,
  sdk,
  startTelemetry,
  shutdownTelemetry,
  service: {
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: DEPLOYMENT_ENV,
  },
  settings: {
    profileTypes: PROFILE_TYPES,
  },
};
