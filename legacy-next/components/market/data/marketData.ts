export interface MarketItem {
  id: string;
  pair: string;
  price: number;
  change: number;
  spread: number;
  high: number;
  low: number;
}

const forexData: MarketItem[] = [
  {
    id: "1",
    pair: "EUR/USD",
    price: 1.0824,
    change: 0.42,
    spread: 0.8,
    high: 1.085,
    low: 1.079,
  },
  {
    id: "2",
    pair: "GBP/USD",
    price: 1.254,
    change: -0.15,
    spread: 1.2,
    high: 1.258,
    low: 1.25,
  },
  {
    id: "3",
    pair: "USD/JPY",
    price: 148.5,
    change: 0.8,
    spread: 0.9,
    high: 149.1,
    low: 147.8,
  },
  {
    id: "4",
    pair: "AUD/USD",
    price: 0.654,
    change: -0.25,
    spread: 1.0,
    high: 0.658,
    low: 0.652,
  },
  {
    id: "5",
    pair: "USD/CHF",
    price: 0.882,
    change: 0.1,
    spread: 1.1,
    high: 0.885,
    low: 0.88,
  },
  {
    id: "6",
    pair: "USD/CAD",
    price: 1.356,
    change: -0.05,
    spread: 1.3,
    high: 1.359,
    low: 1.352,
  },
  {
    id: "7",
    pair: "NZD/USD",
    price: 0.612,
    change: 0.3,
    spread: 1.5,
    high: 0.615,
    low: 0.609,
  },
];

const metalsData: MarketItem[] = [
  {
    id: "8",
    pair: "XAU/USD",
    price: 2035.5,
    change: 0.15,
    spread: 0.3,
    high: 2040.1,
    low: 2030.0,
  }, // Gold
  {
    id: "9",
    pair: "XAG/USD",
    price: 23.12,
    change: -1.2,
    spread: 0.04,
    high: 23.45,
    low: 22.9,
  }, // Silver
  {
    id: "10",
    pair: "XPT/USD",
    price: 920.4,
    change: 0.5,
    spread: 2.5,
    high: 925.0,
    low: 915.0,
  }, // Platinum
  {
    id: "11",
    pair: "XPD/USD",
    price: 960.2,
    change: -0.8,
    spread: 3.0,
    high: 975.1,
    low: 955.0,
  }, // Palladium
  {
    id: "12",
    pair: "GLD",
    price: 189.2,
    change: 0.85,
    spread: 0.05,
    high: 190.0,
    low: 188.5,
  }, // SPDR Gold Shares
  {
    id: "13",
    pair: "SLV",
    price: 21.5,
    change: -0.5,
    spread: 0.02,
    high: 21.8,
    low: 21.2,
  },
];

export const marketData = [...forexData, ...metalsData];
