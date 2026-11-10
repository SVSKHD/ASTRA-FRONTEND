# Market terminal: frontend design and backend dependencies

The trading panel (`/trading`) is being extended into a Dhan-powered market terminal: Market Explorer, Charts & Indicators, Stock Screener, Futures & Options and Watchlists.

This document records:

- what the frontend uses from the backend today, and
- what it needs but cannot get yet.

The source of truth is the backend's OpenAPI contract (`src/api/openapi.json`, regenerated with `pnpm api:gen`), checked against the backend source (`Aureon_agents_Assembler`, `app/api/v1/trading.py`).

The rules:

- No market data is invented.
- No endpoint is assumed to exist.
- Where a dependency is missing, the screen says so and points here.
- Nothing in the terminal places, changes or cancels an order. LIVE trading stays off.

## 1. Navigation

`src/trading/sections.ts` groups the sections:

- **Markets:** Overview, Market Explorer, Charts & Indicators, Stock Screener, Futures & Options, Watchlists
- **Research:** Strategies & Backtests, Signals
- **Accounts & execution:** Dhan Account, MT5, My vs bot, Orders & positions, Paper
- **Risk & Agents:** Risk, Agents

Tablet and desktop show a grouped sidebar. A phone shows one button that opens every section in a sheet.

`/trading/market` is now the Market Explorer. The previous "Watchlist & charts" content moved to `/trading/charts` and `/trading/watchlists`. Every other path is unchanged.

## 2. Instruments: available, with gaps

`GET /api/trading/instruments` takes `broker`, `q`, `instrument_type`, `limit` and `offset`, and returns `Page<InstrumentOut>`. Each `InstrumentOut` has `id`, `broker`, `broker_instrument_id` (`SEGMENT:SECURITY_ID`), `symbol`, `exchange`, `segment`, `instrument_type`, `underlying`, `expiry`, `strike`, `option_type`, `lot_size`, `tick_size` and `currency`.

Missing:

| Need                                                          | Contract requested                                                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exchange and segment filters (NSE/BSE, NSE_EQ/NSE_FNO/IDX_I…) | Add `exchange: "NSE"\|"BSE"` and `segment: str` (repeatable) query parameters to `GET /api/trading/instruments`, applied server-side before pagination.                    |
| Several types at once (all futures, all options)              | Allow `instrument_type` to repeat (`?instrument_type=FUTIDX&instrument_type=FUTSTK`).                                                                                      |
| Instrument master sync status                                 | `GET /api/trading/instruments/status` → `{ "broker": "dhan", "last_synced_at": datetime\|null, "count": int, "by_segment": {"NSE_EQ": int, …}, "last_error": str\|null }`. |

Until these exist, the Explorer's NSE/BSE and segment filters apply only to the page that came back, and say so.

## 3. Quotes and candles: available, with gaps

- `GET /api/trading/quotes?broker&symbols` → `QuoteOut[]`, with fields `symbol`, `last`, `bid`, `ask`, `volume`, `ts` and `source`.
- `GET /api/trading/candles?instrument_id&timeframe&start&end&limit` → `CandleOut[]`, with fields `ts`, OHLC, `volume`, `oi`, `is_gap`, `session` and `source`.
- Timeframes are `1m 5m 15m 30m 1h 4h 1d`.
- The live stream is `GET /api/trading/stream` (`src/trading/stream.ts`).

Missing:

| Need                                  | Contract requested                                                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change and % change                   | Add `previous_close: Decimal\|null` to `QuoteOut`. The frontend computes the change only when that field is present; it never estimates it.                                                                                              |
| Quotes by instrument id               | `GET /api/trading/quotes?instrument_ids=1,2,3`. Symbols are not unique across segments.                                                                                                                                                  |
| Whether the newest candle is complete | Add `is_closed: bool` to `CandleOut`, or document that the newest row may be the live candle. Until then, the chart and the screener treat the newest candle as **unconfirmed** whenever its period has not ended by the server's clock. |

## 4. Indicators: partial

`GET /api/trading/indicators?instrument_id&timeframe&name&since&limit` returns stored rows `{name, ts, values}`. The research worker computes the configured set for configured instruments only (backend `app/agents/research/indicators.py`):

- `ema:9`
- `ema:21`
- `macd:12:26:9` (values `macd`, `signal`, `hist`)
- `atr:14`
- `vwap:UTC`
- `structure:3`

The chart uses server rows when the name matches. Every other study (EMA 8/32/20/50/200, custom EMA, SMA, RSI, ADX, Bollinger Bands, MACD with other periods) is calculated in the browser from the same candles the chart shows, and is labelled as calculated in the browser. The browser formulas follow the backend's: the EMA is seeded with an SMA (`_seeded_ema`), and ATR uses Wilder smoothing.

The browser's formulas live in `src/trading/indicators.ts`, with tests against values the backend module produces. Two caveats:

- **VWAP.** The browser anchors each day on IST and the server stores `vwap:UTC`. NSE's session (09:15–15:30 IST, 03:45–10:00 UTC) falls on the same calendar day in both zones, so the numbers agree for NSE candles.
- **EMA seeding.** A seeded EMA depends on where the series starts. The worker computes on its latest 500 closed candles (`RESEARCH_LOOKBACK_BARS`), and the browser computes on the candles the chart loaded. The two can differ slightly near the start of the loaded range, which is one more reason the chart prefers stored rows.

Missing:

| Need                                 | Contract requested                                                                                                                                                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any study on demand, from the server | `GET /api/trading/indicators/compute?instrument_id&timeframe&specs=ema:8,ema:32,rsi:14,adx:14,bb:20:2,sma:50&limit` → `IndicatorOut[]`, computed on the fly with the same code the screener uses, so the chart and the screener agree to the digit. |

## 5. Watchlists: not available

There is no watchlist API. Lists are kept on the device (`src/trading/watchlists.ts`), and every screen that shows them says "Saved on this device only".

Contract requested:

```
GET    /api/trading/watchlists                      → Watchlist[]
POST   /api/trading/watchlists          {name}       → Watchlist
PATCH  /api/trading/watchlists/{id}     {name}       → Watchlist
DELETE /api/trading/watchlists/{id}                  → 204
POST   /api/trading/watchlists/{id}/items {instrument_id} → WatchlistItem   (409 if present)
DELETE /api/trading/watchlists/{id}/items/{instrument_id} → 204

Watchlist     { id: uuid, name: str (1–40), items: WatchlistItem[], updated_at }
WatchlistItem { instrument_id: int, added_at, instrument: InstrumentOut | null }
```

`instrument: null` marks a delisted instrument, or one missing from the master.

All writes require CSRF, like every other cookie-session write. The live stream should accept `?watchlist={id}` so a device subscribes to a list rather than to ids.

## 6. Screener: not available

There is no screener API, and screening the whole market in a browser is ruled out. The Screener screen builds the request below. Until the endpoint exists, it shows that screening is unavailable and points here. It never shows locally computed or sample results.

```
POST /api/trading/screener/run
{
  "universe": { "exchange": ["NSE"], "kind": ["equity"], "watchlist_id": null },
  "timeframe": "15m",
  "candle": "confirmed" | "live",
  "filters": [
    { "type": "ema_cross", "fast": 8, "slow": 32, "direction": "bullish", "within_bars": 3 },
    { "type": "ema_position", "fast": 8, "slow": 32, "relation": "above" },
    { "type": "price_vs_ema", "period": 200, "relation": "above" },
    { "type": "rsi", "period": 14, "op": "<", "value": 30 },
    { "type": "macd_cross", "fast": 12, "slow": 26, "signal": 9, "direction": "bullish" },
    { "type": "volume", "op": ">", "multiple_of_avg": 2, "avg_period": 20 },
    { "type": "adx", "period": 14, "op": ">", "value": 25 },
    { "type": "vwap_position", "relation": "above" }
  ],
  "sort": { "field": "change_pct", "dir": "desc" },
  "limit": 50, "offset": 0
}
→ {
  "as_of": datetime, "candle": "confirmed"|"live", "timeframe": "15m",
  "universe_size": int, "total": int,
  "items": [ { "instrument": InstrumentOut, "last": Decimal|null, "change_pct": Decimal|null,
               "indicators": { "ema:8": Decimal, "ema:32": Decimal, … },
               "signal": "bullish_cross"|"bearish_cross"|"above"|"below"|null,
               "crossed_at": datetime|null, "data_as_of": datetime } ]
}
GET /api/trading/screener/status → { "last_run_at", "universe_size", "candles_as_of": {tf: datetime}, "worker": "ok"|"stale"|"down" }
```

Until the watchlist API (§5) exists, `universe.watchlist_id` is the id of a list saved on the device, which the server cannot resolve. Once §5 ships it becomes the server list's id.

## 7. Health: partial

The available checks are Dhan session, credentials, account data, feed worker and ticks (`src/trading/dhanHealth.ts`), plus `GET /api/v1/dhan/feed/health`.

Missing: one place that reports instrument master freshness (§2), market-data permission, historical candle coverage, research worker heartbeat and screener freshness (§6). The contract requested is `GET /api/trading/market-health`:

```
{ "checks": [ { "key": "session"|"instrument_master"|"market_data_permission"|"live_feed"|
                        "historical_candles"|"research_worker"|"screener",
                "level": "ok"|"stale"|"missing"|"disabled"|"auth"|"error"|"unknown",
                "text": str, "as_of": datetime|null } ] }
```

Until it exists, each check the frontend cannot read shows **unknown**, never **ok**. A Dhan login is never shown as market-data readiness.

## 8. Futures & Options: available

- Futures: `GET /api/trading/instruments?instrument_type=FUTIDX|FUTSTK&q=<underlying>`
- Option expiries: `GET /api/trading/option-chain/expiries?underlying`
- Option chain: `GET /api/trading/option-chain?underlying&expiry` → per-strike call and put legs with `last_price`, `bid`, `ask`, `oi`, `previous_oi`, `volume`, `implied_volatility`, `delta`, `gamma`, `theta`, `vega` and `broker_instrument_id`

Change in OI is `oi − previous_oi`, shown only when both are present. A leg's lot size comes from its instrument row, never from a constant.

## 9. Strategies & backtests: available

`GET/POST /api/trading/strategies` (`StrategyCreate {name, code_ref, params, description}`), `POST /api/trading/strategies/backtest`, `GET /api/trading/backtests` and `/{id}`, and `GET /api/trading/signals`.

There is no endpoint to enable or disable a strategy, so `is_active` is shown read-only. The contract requested is `PATCH /api/trading/strategies/{id} {is_active: bool}` (admin, CSRF, audited).

The registered strategies are `ema_cross` and `ema_pullback` (backend `app/agents/research/strategies.py`), with `fast`/`slow` EMA periods. Creating a strategy never places a trade.
