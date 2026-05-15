import { Counter, Gauge, Histogram, collectDefaultMetrics, register } from 'prom-client';

collectDefaultMetrics({ prefix: 'learnpress_chat_' });

export const connectedClientsGauge = new Gauge({
  name: 'learnpress_chat_connected_clients',
  help: 'Connected Socket.io clients across chat namespaces.',
});

export const publishCounter = new Counter({
  name: 'learnpress_chat_publish_total',
  help: 'Publish requests accepted by the HTTP API.',
  labelNames: ['event'] as const,
});

export const publishLatencyHistogram = new Histogram({
  name: 'learnpress_chat_publish_duration_seconds',
  help: 'Duration of accepted publish route handling.',
  labelNames: ['event'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

export { register };
