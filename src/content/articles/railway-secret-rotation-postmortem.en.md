---
slug: railway-secret-rotation-postmortem
title: 'Railway Environment-Variable Leak Response — Six Rotation Patterns from Changing 20 Secrets in Three Hours'
description: A field record of responding to the Railway environment-variable exposure by tracing where the same values were used through fingerprints, classifying keys into six rotation types, and setting deployment order. Includes the 41-item target list, the 20 changed that day, the 45-minute outage, a timeline, and a checklist.
category: ai
format: analysis
author: JongKwan Park
lang: en
publishedAt: '2026-10-24T04:40:00.000Z'
translationKey: railway-secret-rotation-postmortem
tags:
  - Security Incident Response
  - Credential Rotation
  - Railway
  - Postmortem
  - Secrets Management
  - AI Agents
draft: false
sources: []
---

> Responding to a provider incident does not end with reissuing keys. You have to know where the same value is used and in what order it must change for the service to survive.

## TL;DR

- On October 21, 2026 (UTC), Railway reported anomalous activity in its customer environment-variable storage system.
- The notice said some customer environment variables may have been decrypted and exposed.
- Our AI backend ran on Railway, and the exposed scope was that service's environment variables.
- The same secret values also lived in Vercel and local `.env` files, so fixing only Railway would not have ended the response.
- We examined 192 secret candidates in `.env*` files, classified 53 as secrets, and assembled 41 rotation targets.
- The leaked items actually named in Railway, including aliases, amounted to 21 groups.
- During the October 24 response we rotated 20 secrets. The DB password had already been changed the day before.
- An automatic clipboard watcher accepted a console URL as a password and caused about 45 minutes of AI backend downtime.
- Keys have to be rotated in separate orders and deployed in waves so that one incident does not cascade into a chain of failures.

**41 is the size of the rotation target list, and 20 is the number actually changed that day. We did not treat the two numbers as meaning the same thing.**

## 1. The incident and the scope that reached us

### What the provider notice said

On October 21 (UTC), Railway announced that it had detected anomalous activity in its customer environment-variable storage system. The statement said some customer environment variables may have been decrypted and exposed. Railway briefly paused deployments and then resumed them, invalidated API and project tokens issued before the incident, and rotated bucket credentials. It worked with several providers to preemptively revoke potentially exposed keys and advised customers who signed up before the incident to change the keys stored in Railway. This material alone cannot establish the provider's internal intrusion path or how an attacker read the environment variables.

Press reports claimed that cryptocurrency wallet keys stored in Railway were stolen and that about $370,000 was drained. Reports also said stolen LLM API keys were being traded. Both are claims in third-party reporting. They must be separated from what Railway confirmed.

### How it reached our service

The AI backend ran on Railway. The API server and web app were on Vercel, the database was managed Postgres, and the cache was managed Redis. The scope directly touched by the provider incident was the AI backend's environment variables on Railway.

But only the variable names differed by platform; the same secret values were being reused in several places. So even though the incident originated at Railway, changing only Railway's values would not have been the end of it. This article does not assert whether the values were actually exploited externally.

Audit-log review to check for access traces and the decision on whether to report were left as separate follow-up work.

**The scope the provider notice confirmed, the credentials our service shared, and whether there was actual abuse must each be recorded separately.**

## 2. Why it was not “change one key”

### Usage relationships mattered more than storage locations

One production secret did not end with a single Railway variable. The same value was also in the API and web deployment environments.



```text
                         ┌─ Railway: AI backend
                         │
same production secret ──┼─ Vercel: API server
                         ├─ Vercel: web
                         └─ local .env copies
                              └─ some connect to production DB·Redis
```

Changing one key was a change spanning multiple platforms, files, and services. Change the value in only one place and deployments end up using different credentials. Overwrite every value at once, and development values can end up in production.

### Different names hide the same value

There were variables that pointed to the same value under one name in Railway and another name in Vercel. `.env` also held aliases copied under different names. Comparing names alone misses the places that share the same secret.

This inventory compared the SHA-256 fingerprints of existing production values along with the names. Values with the same fingerprint were linked into a single rotation group even when the names differed. The screen showed only the length and a short fingerprint instead of the original value.

### The numbers refer to different sets

We found 192 secret candidate names in the repository's `.env*` files. Of these, 53 were classified as secret-grade, and 41 rotation targets were assembled after checking usage and impact. The leaked items actually present in Railway environment variables, including aliases, were 21 groups.

41 is the rotation target list; 21 is the group of items confirmed at the incident source. The number of secrets changed on the response day was 20. The DB password had already been rotated the day before the incident.

Calling any single inventory number “the number of leaked keys” or “the number of completed rotations” distorts the actual scope.

**A key inventory must show how values are reused and where they are used, not just a list of variable names.**

## 3. What to change first: the attacker's current privileges

We set the order by asking, “What can an attacker holding this key do right now?” The privileges a key can exercise took priority over its name or the vendor that issued it.

| Tier | Start | Example impact |
| --- | --- | --- |
| A | Immediately | Account, sensitive data, file, or DB access, or abuse of internal privileges |
| B | Same day | Direct billing, payments, bulk sending, external API usage |
| C | Within the week | Impact on interpretation, translation, login, store integration features |
| Deferred | After a separate migration design | Data identification, decryption, human-memorized reference values |

### A — keys that reach accounts and data directly

With a JWT signing key, an attacker can mint tokens for arbitrary accounts. A Firebase Admin service account can reach reads and writes of sensitive data. An AWS access key can lead to S3 file access.

A password-reset link encryption key creates account-takeover risk. The server-to-server internal API key and the DB password were also A-tier. Because the DB password had been changed the day before, it was managed as a completed item in that day's rotation waves.

### B — billing and bulk abuse

We classified the payment API, three LLM APIs, the mail-sending API, the real-time speech-recognition API, and Redis as B-tier. Abuse of these values could incur direct costs or lead to bulk sending and consumption of service resources.

### C — impact on specific integration features

WebSocket tokens, TTS and store-submission service accounts, the translation API, and the real-time call SDK certificate fell here. Google and Facebook login secrets and the App Store Connect key were also classified as C-tier. This tier does not mean there is no risk.

It means stabilizing A and B first, then checking each integration's actual impact and rotation order.

### Deferred — when data semantics are bound to the key

Changing the billing ledger hash key immediately can make the HMAC values of existing transactions differ from those of new transactions. As a result, duplicate-charge prevention logic might fail to recognize the same transaction. The stored payment-method encryption key could not be discarded until existing data was re-encrypted.

A master-password reference value that a human must remember also could not be changed like an ordinary API key. If keys touching sensitive data were exposed, external access must be checked in GCP, Firebase, and AWS audit logs. The responsible team also has to review whether personal-data breach notification obligations and the 72-hour standard apply.

This article does not determine whether the law applies.

**Urgency is set by the actions a key enables and the scope of damage, not by the key's name.**

## 4. Six rotation types

Even the same “password rotation” differs in how a new value is issued and how long the old value stays alive. Before setting the order, we classified each key into one of the six types below.

### 4.1 Automatic issuance — you can create the new value first

This is the type where a CLI or cloud tool issues the new value. Examples are a directly generated random secret, a Google Cloud service account key, an API key, and an AWS IAM key.

```text
issue new key ──> apply to target environments ──> deploy once ──> verify ──> deactivate old key
   old key usable ───────────────────────────────────────────────┘
```

After deploying, verify that the new key works, then deactivate the old key. When possible, choose a reversible state transition rather than immediate permanent deletion. For example, disable a service account key, use soft delete with a 30-day recovery window for API keys, and set AWS keys to `Inactive`.

Including the reversible revocation step after verification, there was no downtime in the planned rotations.

### 4.2 Overlap — keep both keys alive briefly

This is the type where the provider lets you add a new key while keeping the existing one. This covered the LLM APIs, PayPal's second secret, an additional Google OAuth secret, the call SDK secondary certificate, App Store Connect, the mail-sending API, and the speech-recognition API.

```text
old key:  ────────────────────────────────> delete last
new key:             issued ──> apply ──> deploy ──> verify
```

Create the new key first, verify it with the vendor API, then apply it to the environment. Only after deployment and verification are done do you delete the old key. Briefly overlapping two credentials buys transition time and helps make rotation seamless.

In this response, the old speech-recognition API key was deleted before the new key was deployed. In pre-checks the new key returned HTTP 200 and the old key in production returned 403. In other words, production speech-recognition calls could be rejected until the deployment finished. Because the new key had already been verified, we deployed immediately after that check, and production switched to the new key about 1 minute 30 seconds later. There is no record of when the old key was deleted, so the actual gap was not measured.

### 4.3 Predetermine — we choose the new value and the vendor applies it

This is the type where we can choose the new value, but the old value becomes invalid the moment the vendor stores it. This covered the managed Postgres password.

```text
generate new password
      │
      ├──> apply first to Railway·Vercel·the needed .env entries
      │
      └──> start deploy ── about 60 s ── DEPLOYING
                                      │
                                      └──> store the new password at the vendor
                                           verify the new instance connects
```

This order is the method the CTO devised and executed directly when rotating the DB password the day before the incident. Put the new value into every target environment first, start the deployment, and while it is running, store the same value in the vendor console. Observed service interruption was about 2–3 seconds.

Three things made this work. Railway keeps traffic on existing instances until a new instance passes its health check. Postgres does not drop already-established sessions when the password changes. And the new instance retries its DB connection, so if the vendor value changes in the meantime, the connection succeeds. Conversely, if the vendor changes first, every server loses DB access until the new deployment finishes.

This is behavior we verified in our configuration at the time. It does not guarantee the same result for other DB and deployment combinations.

### 4.4 Vendor first — change the value while existing connections hold

This is the type where deploying the new value first can leave clients unable to reconnect. The managed Redis password was like this.

```text
existing instance ───── keeps existing authenticated connections ─────────────┐
vendor password change ──> verify auth with the new value ──> deploy immediately ──┴─> new connections
```

Our Redis client tried to reconnect ten times over about 3 seconds, gave up, and did not try again. So if we had deployed the new value first as in the predetermine type, the new instance could have been left unable to connect to Redis. Changing the password at the vendor first kept already-authenticated connections alive.

We verified only `AUTH` with the new value and deployed right away. In the measurement at the time there were zero errors, and the new instance reached the Redis client ready state. Even for the same password rotation, the client's reconnect policy changes the order.

### 4.5 Immediate invalidation — apply the vendor-generated random value at once

This is the type like the Facebook app secret, where the vendor creates the new value and the old one becomes invalid the moment you reset it. You cannot predetermine the new value or overlap the two.

```text
choose a low-traffic window ──> reset at the vendor
                                    │ old key invalid immediately
                                    └─> fetch the new value ──> apply·deploy immediately ──> verify login
```

Pick a low-traffic window and make the gap between reset and deployment as short as possible. The affected login feature could be down for about 1–2 minutes. Do not expand that into a claim that other logins or the whole service went down during that time.

### 4.6 Data-bound — stop ordinary rotation and introduce versions

If a key is used to identify or decrypt data that is already stored, it cannot be discarded immediately. We deferred this type from the ordinary rotation list.

```text
write:      v1 ──> validate v1·v2 concurrently ──> record v2
read:       recognize both v1·v2 ────────────────> data migration complete ──> retire v1
```

If an HMAC key is used to identify transactions in the billing ledger, rotating it can affect duplicate-charge prevention. For an encryption key, a procedure to re-encrypt stored data with the new key is needed first. A safe starting point is to add a key-version field, validate v1 and v2 in parallel, then migrate the data.

Not applying this design from the start was left as the next improvement item.

**You have to decide the type before pressing the rotate button, because that is what lets you predict the deployment order and the downtime.**

## 5. The local key rotation console

The console built on the day of the incident was a local tool that handled key inventory and rotation work on one screen. We designed v2 in the afternoon to reflect the contamination incident that v1 caused in the morning.

### A screen that opens only locally

The server bound only to `127.0.0.1`. It created a new access token on every run and appended it to the URL.

```text
http://127.0.0.1:<PORT>/?t=<ONE_TIME_TOKEN>
```

It also checked the request's `Host` and `Origin` to reduce DNS-rebinding and CSRF risk. The content security policy started from `default-src 'none'`. It used only Node built-in modules, and the screen was a single HTML page.


### Values are not left in the screen, logs, or state files

Secret values were never printed on screen or stored in logs or state files. The screen showed only the value's length and the first six characters of its SHA-256 fingerprint. CLI values were passed via standard input, not as command-line arguments.

This reduces the chance of a value ending up in a process list or shell history. The clipboard was cleared right after a single read, and if a known secret string appeared in an error message it was replaced with `hidden`.

```text
value received from the vendor
      │
      └── standard input ──> provider CLI
            the value itself is not stored in the screen·logs·state files
```

### Find coupling through value fingerprints

The console compared SHA-256 fingerprints of existing production values to find the same value under different names. It linked Railway variables and local `.env` entries by value. For Vercel it found the same usage sites by the linked variable names.

The groupings ensured that one rotation was applied to every related environment. For local `.env`, only lines whose fingerprint matched an existing production value were changed. Lines using different values for development were left alone.

### Priority waves and deployment counts

We grouped the A, B, and C tiers into waves. To avoid an automatic deployment on every variable change, we batched applications with `--skip-deploys`. In each wave we applied the target values, went through one deployment and a check, and then revoked the old keys.

Deploying separately for each key could have restarted the server more than ten times.

### Verify behavior before applying

For keys that could be verified, we first checked that the new value worked using the vendor's free lookup API or an authentication request. For LLM APIs we listed models, for payments we requested an OAuth token, and for the speech-recognition API we listed models. For Redis we sent only `AUTH` without any data command.

If verification failed, we did not apply the value to production. Keys with no verification API were marked for post-deployment log checks rather than being automatically treated as fine.

### Deployment success is not service health

After deployment we checked health responses and platform logs. We counted type-specific patterns such as DB authentication failures, Redis `WRONGPASS`, API key authentication errors, OAuth failures, and AWS access key errors. The only thing we stored was the line count per pattern. Raw log text was not kept in state files.

In fact, while the AI backend failed DB authentication and could not start, the Railway deployment status was `SUCCESS`. Finishing the check with only the deployment status or a single health response can miss this.

### Local values are applied by naming them after a preview

When a new value was put into `.env`, the console let us preview which keys and fingerprints would change first. Then we named the variables to apply explicitly. The actual preview surfaced a local development WebSocket token key instead of a production value.

Without the naming step, that value would have been applied to production.

**The console's purpose is not just to make key rotation fast. It has to block paths by which the wrong value slips in silently.**

## 6. The outage we caused and how we corrected it

### The automatic watcher read a URL as a password

Console v1 opened the vendor page and watched the clipboard so that when the user copied a value it was applied automatically. The check was loose: “at least 16 characters, no spaces.” In the DB step, the user's copied URL of the console itself was accepted as the DB password.

In the Redis step, the Redis admin page URL went in as the Redis password. A URL is also long and has no spaces. A check that only looked at format did not stop it.

```text
automatic clipboard watching
      │
      ├─ console URL ─────> applied as DB password
      └─ Redis page URL ──> applied as Redis password
                                  │
                                  └─> AI backend redeploy
                                       DB auth failure·fails to start
```

### The AI backend was down for about 45 minutes

The incident ran from 09:18 to 10:05 KST on October 24. For about 45 minutes the AI backend could not start because DB authentication failed. The API server's separate redeploy failed because we did not specify the Vercel team scope.

As a result the previous API deployment stayed alive. This was not a planned safeguard but an accidental safety net. The user re-entered the correct DB password into `.env` and checked the fingerprint and format.

After applying the correct values to Railway and Vercel, we redeployed only the AI backend to recover.

### v2 changed the input path

We removed automatic clipboard watching entirely. The clipboard is read once only when the user explicitly presses the “import” button. PEM format is the exception; URL and address formats are rejected, and a separate pattern is applied per key.

Keys that can be checked are applied after verifying them with the vendor API. Keys that cannot be verified are marked for post-hoc log checks. Automation that improves convenience becomes a silent contamination path if it holds onto a wrong value for long.

**We looked for the cause of the outage in the combination of automatic watching and loose validation, not in the input value, and removed that path.**

## 7. Small traps we met in the field

### Environment variable options differ by platform

Vercel's `--sensitive` option could not be used together with variables that also target the development environment. Applying a variable failed midway, so we removed the option and continued.

### Redeployment needed a team scope

When the Vercel redeploy did not specify a team scope, we got a “Deployment belongs to a different team” error. The deploy CLI also had to specify the team scope for the current account and project.

### AWS CLI stopped at interactive input

The AWS login flow asked for the region interactively. Pressing the automation screen several times left five waiting processes with the same prompt. Region and environment settings must be specified non-interactively, and the retry button needs a guard against duplicate execution.

### The speech-recognition API needed the right region

Sending a Japan-region key to a US endpoint returned 401 even for a valid key. We could judge the key only after matching the verification address to the region actually in use.

### A new key's prefix may be unfamiliar

The new key issued from the LLM console had a different prefix than the one we expected. We did not reject it based on the string's appearance and instead relied on the vendor's verification result.

### Service account keys have other consumers

A service account key for store submission may be used not only by the server but also by other automation such as mobile app auto-submission. We remembered this only after deactivating the old key. Find other consumers of the same key before deactivation. Fortunately, deactivation was reversible.

### App Store Connect key files cannot be downloaded again

The key file could be downloaded only once. Before revoking a key, confirm a safe backup, and refresh the backup after rotation.

**Per-provider CLI options, regions, shared consumers, and key backup methods should be fixed in a pre-flight checklist.**

## 8. How we worked with AI agents

During the response, AI coding agents helped with inventory analysis, writing the local console, and automating deployment status and log checks. The safeguard in the agent runtime blocked the agent from writing values directly into the secret store. We did not bypass it; we changed the tools' roles.

The agent built the verification and application tools, and the step of entering secret values was left for a human to trigger with a button or after explicit approval. Values were not shown on the agent screen; only fingerprints were checked. Original values were also hidden from error messages and state records.

Console v2 was built in about an hour by writing the spec first and dividing the server, screen, and runbook work among three agents. The main operator compared the spec against the results and verified the actual integrated behavior. Incident research had a different problem.

The free research agent we assigned first stopped after exceeding its usage limit. The replacement agent incorrectly reported that the incident could not be confirmed. We corrected the error by directly cross-checking the official notice, status information, and press reports.

Incident facts must be checked against primary sources first.

**Agents were positioned not as parties that handle secrets on our behalf, but as workers that build tools and verification procedures under human control.**

## 9. Timeline and numbers

### October 24 KST response

| Time | Work |
| --- | --- |
| 06:45 | Confirmed official notices and reports and began incident response |
| 07:05 | CLI cleanup |
| 08:00~09:00 | Built console v1 |
| 09:00 | Began key rotation with the console |
| 09:18 | AI backend DB outage from applying a wrong value |
| 10:05 | AI backend recovered after applying the correct value |
| 10:27 | Completed five A-tier items, including old key revocation |
| 11:01 | Applied B-tier LLM, payment, and mail APIs |
| 11:14 | Applied the speech-recognition API |
| 11:27 | Redis rotation, zero observed connection drops |
| 11:32 | Completed four C-tier automated rotations |
| 11:53 | Completed four C-tier manual rotations |
| 12:49 | Finished console v2 and runbook |

The core rotation window was about three hours, from 09:00 to 11:53. Refining the tools and runbook continued until 12:49.

### Deployments and key counts

Twenty secrets were actually rotated on the response day. The DB password had already been rotated the day before. The AI backend was redeployed about 9 times, the API server 6 times, and the web app 2 times.

A Railway deployment took about 35–45 seconds, the Vercel API about 1–1.5 minutes, and the web app about 2–3 minutes. The redeployment counts also show why we batched keys into waves instead of deploying per key. The rotation work a human experienced was about three hours.

The assessment that it would have taken all day without the tooling is the CTO's estimate, not a measured comparison.

**The timeline must record outage time, actual rotations, and target-list size separately so the results are not exaggerated.**

## 10. Retrospective and next work

### What went well

We confirmed official notices and primary sources and defined the incident scope. We used fingerprints, not just key names, to find coupling across platforms and local copies. We ordered A, B, C by what an attacker could do.

We varied the issue, apply, deploy, and revoke order by key type. We cut deployments to one per wave and kept only error counts instead of raw log text.

### What we missed

Development local environments shared the production DB and Redis. There was no inventory that routinely showed, automatically, the extent to which the same production secret had been copied under different names. Clipboard auto-watching made input easy but did not check where a copied value came from.

Data-bound keys had no version information, so they had to be excluded from the ordinary rotation list.

### Follow-up work

- Introduce key versions for data-bound secrets.
- Review cloud and storage audit logs for the exposure window and finish the reporting decision with the responsible team.
- Refresh key backups.
- Consider workload identity or short-lived tokens instead of long-lived secrets where possible.
- Document each client's reconnect policy and actual retry timings.
- Run a key rotation rehearsal once or twice a year in peacetime.

Building the inventory for the first time after a provider notice may already be too late. Knowing value usage relationships and deployment times in advance is what shortens actual response time.

**Shortening the next incident starts with preparing inventory and rehearsals before it happens.**

## 11. Field checklist

### First 30 minutes after the incident

- Check the provider's official notice and status page for scope and recommendations.
- Open the vendor console through your usual path, not through a link in an email.
- Record the leak source, affected environments, and leaked variable names.
- Separate variables actually present at the leak source from coupled items that use the same values.
- Use fingerprints to find whether the same value exists in other hosting and local `.env` files.
- Set A, B, C by what an attacker could do with each key.
- For keys that reach sensitive data, assign owners for audit-log review and the reporting decision.

### Executing rotation

- For each key, choose a type: automatic issuance, overlap, predetermine, vendor first, immediate invalidation, or data-bound.
- Before putting a new key into production, verify it with the vendor API or an authentication request.
- Apply A-tier values first and reduce deployments per wave.
- For overlap keys, revoke the old key after the new deployment and verification.
- For vendor-first keys, check the client's existing connections and reconnect policy.
- Never leave values in chat, logs, command-line arguments, or state files.
- Apply local `.env` only after previewing and confirming variable names.
- Exclude data-bound keys from ordinary rotation until a separate version migration plan exists.

### After deployment

- Check service health separately from the platform deployment status.
- Check DB, Redis, API key, OAuth, and cloud authentication errors by type.
- Do not copy and store raw logs; keep only the counts you need.
- Confirm the new key is actually in use, then deactivate or revoke the old key.
- Check whether the same key remains in other services and automation.
- Confirm backups of key files that can be downloaded only once.

### Peacetime preparation

- Record variable names, owners, environments, value coupling, and rotation type in the secret inventory.
- Reduce long-lived secrets and consider short-lived credentials or workload identity.
- Give data-bound keys a version field.
- Measure client reconnect policies and average deployment times.
- Check per-vendor CLI options, regions, and reversible revocation methods.
- Run key rotation drills regularly and update the runbook.

## Closing

In this response, the work that consumed time was not creating new keys. It was finding where the same value was used, choosing the right order for each key, and verifying that the new value had actually been applied. Automation helped hide key values and reduce repetitive work.

At the same time, v1's clipboard watching became a channel that turned wrong input into production values. Next time we want to start from a structure where humans control values and the tools own coupling relationships, rotation order, and verification results.

**You cannot avoid provider incidents, but you can prepare the usage relationships of your keys and your rotation procedure in advance.**

Reference standards: postmortem structure of impact, timeline, cause, correction, and lessons; dual-key (overlap) and key-versioning practices for credential rotation.
