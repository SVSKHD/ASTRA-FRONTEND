export const generateHistory = (basePrice: number, points: number = 50) => {
  const history = [];
  let currentPrice = basePrice;
  const now = Date.now();
  const interval = 60 * 60 * 1000; // 1 hour intervals

  // Generate history backwards
  const reverseHistory = [];

  for (let i = 0; i < points; i++) {
    reverseHistory.push({
      time: now - i * interval,
      value: currentPrice,
    });

    const volatility = basePrice * 0.002;
    const change = (Math.random() - 0.5) * volatility;
    currentPrice -= change;
  }

  return reverseHistory.reverse();
};

export const generateInterpolatedHistory = (
  dataPoints: ({ time: number; value: number } & Record<string, any>)[],
  stepsBetween: number = 10,
) => {
  if (dataPoints.length < 2) return dataPoints;

  const result = [];

  for (let i = 0; i < dataPoints.length - 1; i++) {
    const start = dataPoints[i];
    const end = dataPoints[i + 1];

    result.push({ ...start, isReal: true }); // Ensure start has isReal

    const timeDiff = end.time - start.time;
    const valueDiff = end.value - start.value;
    const stepTime = timeDiff / (stepsBetween + 1);
    const stepValue = valueDiff / (stepsBetween + 1);

    // Base volatility on the step size to keep it proportional
    // BUT ensure a minimum volatility based on the value itself (e.g. 0.05% of value)
    // This ensures that even if valueDiff is 0 (flat line), we still get some market noise.
    const baseVolatility = Math.abs(valueDiff) * 0.5;
    const minVolatility = start.value * 0.0005; // 0.05% noise floor
    const volatility = Math.max(baseVolatility, minVolatility);

    for (let j = 1; j <= stepsBetween; j++) {
      const time = start.time + j * stepTime;
      // Linear interpolation base
      let value = start.value + j * stepValue;

      // Add random wave/noise
      // Using sine wave for structure + random for noise
      const wave =
        Math.sin((j / stepsBetween) * Math.PI) *
        volatility *
        (Math.random() * 0.4 + 0.1);
      // Random jitter
      const jitter = (Math.random() - 0.5) * (volatility * 0.2);

      result.push({
        time,
        value: value + wave + jitter,
        isReal: false,
      });
    }
  }

  // Add the last point
  result.push({ ...dataPoints[dataPoints.length - 1], isReal: true });
  return result;
};
