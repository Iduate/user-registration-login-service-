const base = {
    service: 'auth-service',
    version: 'v1'
};
export const log = (level, msg, data = {}) => {
    const payload = {
        ...base,
        level,
        msg,
        timestamp: new Date().toISOString(),
        ...data
    };
    console.log(JSON.stringify(payload));
};
export const logMetric = (name, value = 1, dimensions = {}) => {
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
