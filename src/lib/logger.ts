type LogLevel = 'info' | 'warn' | 'error';

type LogShape = Record<string, unknown> & {
  level?: LogLevel;
  msg?: string;
};

const base = {
  service: 'auth-service',
  version: 'v1'
};

export const log = (level: LogLevel, msg: string, data: Record<string, unknown> = {}) => {
  const payload: LogShape = {
    ...base,
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data
  };

  console.log(JSON.stringify(payload));
};

export const logMetric = (name: string, value = 1, dimensions: Record<string, string> = {}) => {
  const metric = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: 'AuthService',
          Dimensions: [Object.keys(dimensions)],
          Metrics: [
            {
              Name: name,
              Unit: 'Count'
            }
          ]
        }
      ]
    },
    ...dimensions,
    value
  };

  console.log(JSON.stringify(metric));
};
