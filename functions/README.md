# Aureon functions

The server half of device activity (section 27a). Everything here exists because
it cannot correctly run in a browser — see the header comment in `src/index.ts`
for the reason each one is on this side of the line.

## Deploy configuration

| Variable                | Required | What it does                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IP_HASH_SALT`          | **yes**  | A random 32+ character secret. IP addresses are hashed with it and then discarded; the raw address is never written to a document. Without a salt, a SHA-256 of the 2³² IPv4 space is a rainbow table someone has already built, so `hashIp` refuses to run rather than storing a reversible hash. |
| `GEOIP_ENDPOINT`        | no       | A URL template containing `{ip}`, e.g. `https://ipapi.co/{ip}/json/`. Only consulted when the request carries no `x-appengine-*` headers (local emulator, a non-Hosting entry point). Left unset, no third party is contacted at all.                                                              |
| `VITE_FUNCTIONS_REGION` | no       | Client-side, not here — set it in the frontend's env to match the region these deploy to. A callable invoked with the wrong region fails with a CORS error that mentions nothing about regions.                                                                                                    |

Set them with:

```
firebase functions:secrets:set IP_HASH_SALT
```

Rotating `IP_HASH_SALT` invalidates every stored `ipHash`. That is not a data
loss — the field is only ever compared against other hashes from the same salt —
but sessions will stop matching their own history until each device checks in
again.

## What is deployed

| Function               | Kind             | Purpose                                                                                                                  |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `registerSession`      | callable         | Upserts this install's session row, resolves a coarse location from the request IP, logs `new-device` and `new-country`. |
| `heartbeat`            | callable         | Updates `lastActiveAt` (floored at ~4 min) and reports revocation.                                                       |
| `revokeSession`        | callable         | Writes `revokedAt`; `hard: true` also calls `revokeRefreshTokens`.                                                       |
| `revokeOtherSessions`  | callable         | "Sign out everywhere else", plus a hard token revocation.                                                                |
| `clearActivityHistory` | callable         | Deletes activity older than the current session.                                                                         |
| `purgeExpiredActivity` | scheduled, daily | Activity older than 90 days and revoked sessions older than 30 days.                                                     |

## Why the client cannot write these documents

`firestore.rules` gives the client `allow read` and `allow write: if false` on
both collections. `revokedAt` and `lastActiveAt` are security controls, and a
control the subject can write is not a control: a revoked device could clear its
own `revokedAt`, and any device could backdate its liveness.
