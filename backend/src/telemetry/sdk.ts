import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { context } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const shouldEnableOtel =
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST &&
  process.env.OTEL_ENABLED !== 'false' &&
  Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

let sdk: NodeSDK | null = null;

function patchConsoleToOtel(serviceName: string): void {
  const logger = logs.getLogger(serviceName, '0.1.0');
  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  const emit = (severityNumber: SeverityNumber, severityText: string, args: unknown[]) => {
    const body = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    logger.emit({
      severityNumber,
      severityText,
      body,
      context: context.active(),
    });
  };

  console.log = (...args: unknown[]) => {
    origLog(...args);
    emit(SeverityNumber.INFO, 'INFO', args);
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    emit(SeverityNumber.WARN, 'WARN', args);
  };
  console.error = (...args: unknown[]) => {
    origError(...args);
    emit(SeverityNumber.ERROR, 'ERROR', args);
  };
}

if (shouldEnableOtel) {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'm9-reservas-grupo-09';

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: 10000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  patchConsoleToOtel(serviceName);
  console.log(`[OpenTelemetry] Telemetría (métricas, trazas y logs) iniciada para ${serviceName} -> ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}`);
}

export const shutdownTelemetry = async (): Promise<void> => {
  if (sdk) {
    await sdk.shutdown();
  }
};
