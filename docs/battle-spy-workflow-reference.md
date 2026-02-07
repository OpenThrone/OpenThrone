# Battle and Spy Workflow Reference

Date: 2026-02-07
Status: implementation reference (matches current code paths)

## Scope and Source of Truth

This document is an implementation-level reference for battle and spy behavior in the current backend.

Primary files:
- `src/pages/api/attack/[id].ts`
- `src/pages/api/spy/[id].ts`
- `src/middleware/apiGuard.ts`
- `src/middleware/idempotency.ts`
- `src/services/Battle.service.ts`
- `src/services/AttackService.ts`
- `src/services/SpyService.ts`
- `src/services/AttackValidationService.ts`
- `src/utils/attackFunctions.ts`
- `src/utils/spyFunctions.ts`
- `src/utils/balance/effectiveStats.ts`
- `src/utils/spy/results.ts`

## Shared API Layer Behavior

All combat/spy mutation endpoints are wrapped by `withApiGuard`.

Shared guard behavior:
- Allowed methods are enforced (`405` if invalid).
- Security headers are set (`X-Request-Id`, `X-Frame-Options`, etc).
- Auth mode is enforced (`401` when required and no session).
- Request validation is performed by Zod schemas (`422` on invalid query/body).
- Rate limiting uses in-memory profiles in `apiGuard`:
  - `attack`: 20 requests / 60s per `attack:method:url:ip`
  - `spy`: 20 requests / 60s per `spy:method:url:ip`

Both attack and spy endpoints also enforce idempotency:
- Requires `Idempotency-Key` (or `X-Idempotency-Key`) header.
- Duplicate hash in active TTL returns `409 Duplicate request`.
- Missing key returns `400`.

## Battle Workflow

### 1) HTTP Entry

Endpoint: `POST /api/attack/[id]`

Validated inputs:
- Query: `id` (defender user id)
- Body: `turns` (attack turns)

API-level flow:
1. Guard checks method/auth/rate/body/query.
2. Idempotency is enforced with scope `attack:{defenderId}` and actor key of current session user id.
3. Calls `BattleService.executeAttack({ attackerId, defenderId, attackTurns })`.
4. On success with log id, emits socket `attackNotification` to defender room.
5. Returns service result payload.

### 2) Service Validation Layers

`BattleService.executeAttack`:
- Blocks self-attack (`SELF_ATTACK`).
- Ensures attacker and defender exist.
- Ensures `attackTurns <= attacker.attack_turns`.
- Ensures attacker has at least one `OFFENSE` unit type row.
- Delegates execution to `AttackService.executeAttack`.

`AttackService.executeAttack`:
- Checks feature flag `NEXT_PUBLIC_ENABLE_ATTACKING` not disabled.
- Checks `attackTurns` and stamina against attacker.
- Ensures attacker has non-negligible offense power (`MeleeAtkPower > 0`).
- Enforces level-range via `AttackPlayer.canAttack(defender.level)`.
- Enforces anti-farm history via `canAttack`:
  - `< 5` attack logs of type `attack` for attacker->defender in last 24h.

### 3) Strength Model (`calculateStrength`)

Strength is computed as:
- `baseStats` from units.
- `itemStats` from compatible equipment.
- `upgradeStats` from battle upgrades.
- `totalStats = ceil((base + items + upgrades) * bonusMultiplier)`.

Bonus multiplier:
- Offense: `1 + attackBonus/100`
- Defense: `1 + defenseBonus/100`

Inclusion rules:
- Default offense calculations include `OFFENSE`.
- Default defense calculations include `DEFENSE`.
- Optional support inclusion:
  - `CITIZEN` and `WORKER` at 10% effectiveness.
  - `OFFENSE` can assist defense at 70% effectiveness when enabled.

### 4) Turn Simulation (`simulateBattle`)

Core constants from `BATTLE_CONSTANTS`:
- `MAX_TURNS = 15`
- `FORT_CRITICAL_THRESHOLD = 0.3`
- `LOW_DEFENSE_RATIO = 0.25`
- `MAX_LEVEL_DIFFERENCE = 5`
- `ATTACKER_DAMAGE_MULTIPLIER = 1.148`
- `DEFENDER_COUNTER_DAMAGE_MULTIPLIER = 0.8`
- `DEFENDER_RANGED_ATTACK_INTERVAL = 2`
- `MAX_PILLAGE_SHARE_PER_ATTACK = 0.35`
- `DAMAGE_VARIANCE_MIN = 0.92`
- `DAMAGE_VARIANCE_MAX = 1.08`

Per-turn high-level order:
1. Compute level mitigation:
   - If attacker level exceeds defender by more than 5:
   - `levelMitigation = 0.96^(attackerLevel - defenderLevel - 5)`
2. Recompute attacker/defender strength for current turn.
3. Apply fort-breached defender penalty:
   - Defender melee/ranged defense x 0.5 if fort HP is 0.
4. Defender ranged attack executes every 2 turns (current config).
5. Odd turns: attacker melee phase + fort damage + loot attempt.
6. Even turns: defender melee phase.
7. Apply casualties by HP and unit pools.
8. Update remaining units and stamina.
9. Early-exit if attacker has no offense units or defender has no valid targets.

### 5) Damage and Casualty Formulas

`newComputeCasualties` pipeline:
1. Effective defender defense floor:
   - `defenderDefFloor = max(1, floor(attackerAtk * 0.05))` when attackerAtk>0.
2. Raw damage:
   - `damage = max(0, attackerAtk - effectiveDefenderDef)`.
3. Piercing multiplier for ratio > 1:
   - `safeRatio = clamp(piercingRatio, 1, 100)`
   - `piercingMultiplier = 1 + log10(safeRatio)`
   - `damage *= piercingMultiplier`
4. Fort soak (if fort exists):
   - `fortHpRatio = fortHP / initialFortHP`
   - `fortSoakMultiplier = 1 - 0.5 * fortHpRatio`
   - `damage *= fortSoakMultiplier`
5. Fort mitigation (if defender fort level present):
   - `fortMitigationPct = fort.casualtyMitigation / 100`
   - `casualtyBonusPct = defender casualty bonuses / 100`
   - `structureMitigationPct = armory casualty mitigation / 100`
   - `fortRelatedPct = (fortMitigationPct + casualtyBonusPct) * fortHpRatio`
   - `totalMitigationPct = clamp(fortRelatedPct + structureMitigationPct, 0, 0.75)`
   - `mitigationMultiplier = 1 - totalMitigationPct`
   - `damage *= mitigationMultiplier`
6. Low-level protection:
   - If defender protected, `damage = floor(damage * 0.1)`.
7. Final:
   - `damageDealt = ceil(damage)`.

Casualty allocation:
- Damage is applied against target unit HP, lowest-level first.
- Fighting pools first (`DEFENSE`, and optionally `OFFENSE` when enabled).
- Collateral (`CITIZEN`, `WORKER`) only after fort breach when collateral inclusion is enabled.

### 6) Fort Damage Formula

Fort damage uses ratio bucket ranges:
- ratio <= 0.05 -> `[0,0]`
- <= 0.2 -> `[0,1]`
- <= 0.5 -> `[1,3]`
- <= 1.0 -> `[3,6]`
- <= 1.5 -> `[6,10]`
- <= 2.0 -> `[10,15]`
- else -> `[15,25]`

Actual fort damage:
- `damage = floor(mtRand(min,max,random))`

### 7) Loot Formula and Caps

`calculateLoot`:
- `uniformFactor = mtRand(90,99)/100`
- `turnFactor = mtRand(100 + 8*turns, 100 + 15*turns)/350`
- `levelDifferenceFactor = 1 + min(0.7, abs(levelDiffCappedTo7)*0.07)`
- `defenderLevelFactor`:
  - level < 10 scales from 0.4 to 0.7
  - 10..20 scales 0.7 to 1.0
  - >=20 is 1.0
- `lootFactor = uniformFactor * turnFactor * levelDifferenceFactor * defenderLevelFactor`
- `calculatedLoot = defenderGold * lootFactor`
- clamped to `[0, defenderGold]`.

Per-battle cap:
- Total pillage cannot exceed `35%` of defender starting hand gold.
- Applied each turn as min(requested, current defender gold, remaining cap budget).

### 8) Battle Winner and XP

Winner (`calculateAndApplyExperience`):
- Primary: higher total casualties inflicted wins.
- Tie-break: attacker wins if fort damage > 0 or fort destroyed.

XP (`calculateBattleExperience`):
- `baseXP = 1000`
- `levelBonus = levelDifference*0.05*baseXP` when defender higher level
- `fortBonus = 0.5*baseXP` if fort destroyed
- `turnsMultiplier = attackTurns / 15`
- `baseXPPerTurn = baseXP / 15`
- `totalXP = (baseXPPerTurn*attackTurns + levelBonus + fortBonus) * turnsMultiplier`
- Winner/loser split:
  - winner side gets 75%
  - loser side gets 25%

### 9) Battle Persistence and Side Effects

Persisted in a DB transaction:
- `attack_log` row with:
  - `winner`, `pillaged_gold`, attacker/defender loss totals
  - telemetry in `stats`:
    - start/end snapshots
    - damage slices
    - mitigation logs/summaries
    - contribution slices
    - win probability proxy
- `bank_history` for war spoils if attacker won.
- Updated unit counts for attacker and defender.
- Stat increments:
  - attacker `OFFENSE` won/lost
  - defender `DEFENSE` won/lost
- Persisted user resource/stat updates:
  - gold, attack turns, stamina, experience, offense/defense/spy/sentry, fort HP.

Expected battle response shape:
- `status: success|failed`
- `result: boolean` (attacker won)
- `attack_log: number`
- `extra_variables` containing summarized battle details.

## Spy Workflow

### 1) HTTP Entry

Endpoint: `POST /api/spy/[id]`

Validated inputs:
- Query: `id` (defender id)
- Body:
  - `type`: `INTEL | ASSASSINATE | INFILTRATE`
  - `spies`: integer
  - `unit` optional for assassination targets.

API-level flow:
1. Guard checks method/auth/rate/body/query.
2. Idempotency scope is `spy:{type}:{defenderId}`.
3. Additional route-level mission checks are applied.
4. Calls `SpyService.executeSpyMission(...)`.
5. Emits defense notification if defender is winner in log.
6. Returns service result.

### 2) Route-Level Spy Preconditions

`INTEL` route checks:
- `1 <= spies <= 10`
- attacker has enough level-1 spies.

`ASSASSINATE` route checks:
- generic `checkParams` plus max of 5 passed into checker.

`INFILTRATE` route checks:
- defender-specific daily history limits by `attack_log` (24h window).
- spies positive.
- `spies <= perMission`.
- attacker has enough level-2 spies.

Service-level checks still apply after route checks.

### 3) Service-Level Spy Preconditions

`SpyService.executeSpyMission` validations:
- attacker/defender exist.
- attacker has enough total spies for request.
- attacker spy offense is non-zero.
- mission unlock and limits:
  - `INFILTRATE`: unlocked, perMission/perUser and infiltrator count.
  - `ASSASSINATE`: unlocked, perMission/perUser and assassin count.

Winner field used for log row is currently:
- `attacker.spy > defender.sentry ? attacker : defender`

Note: this winner assignment is independent of Stage 3 probabilistic mission success flag and can diverge from mission-resolution success in edge cases.

### 4) Stage 3 Probability Model (Feature-Flagged)

Shared module: `src/utils/balance/effectiveStats.ts`

Spy success probability:
- ratio `r = attackerSpy / max(1, defenderSentry)`
- guardrails:
  - `r <= 0.25 -> 0.01`
  - `r >= 4 -> 0.99`
- logistic core:
  - `x = k * ln(max(0.01,r)) + situationalModifier`
  - `p = sigmoid(x)` with default `k=2.4`
  - clamp to `[0.01, 0.99]`
- mission success sampled by `random() < p`.

Mission situational modifiers:
- `INTEL`: `+0.2` (easier)
- `INFILTRATE`: `0.0` (neutral)
- `ASSASSINATE`: `-0.2` (harder)

Rollout controls:
- `OT_ENABLE_BALANCE_V2=true|false` global override.
- If empty/unset, deterministic user rollout by:
  - `OT_BALANCE_V2_ROLLOUT_PERCENT` (0..100)
  - hash bucket on attacker id.

If V2 disabled for user:
- Legacy binary success gate is used:
  - `success = attacker.spy > defender.sentry`.

### 5) Intel Mission Details

Function: `simulateIntel`

Behavior:
- clamps spies to `[1,10]`.
- determines success (V1 binary or V2 logistic).
- on success:
  - death risk per spy: `max(0, 1 - attacker.spy/defender.sentry)`
  - `intelPercentage = min((spies - spiesLost)*10, 100)`
  - randomly samples intel keys and partial arrays (`units`, `items`) by percentage.
- on failure:
  - removes sent spies from attacker level-1 spy units.

Expected result fields:
- `success`
- `spiesSent`, `spiesLost`
- `intelligenceGathered` partial snapshot
- dynamic metadata:
  - `successProbability`
  - `probabilityModel` (`LOGISTIC_V2` or `BINARY_V1`)

### 6) Assassination Mission Details

Function: `simulateAssassination`

Phases:
1. Sentry gate success (V1 binary or V2 logistic).
2. If failed:
   - spies lost sampled by multiplier around:
   - `lossMultiplier = min(1, max(0,1-ratio)*0.6 + 0.4)`
3. If passed:
   - spy-vs-sentry combat casualties using clandestine strengths.
4. Target kill phase:
   - separate handling for `CITIZEN_WORKERS` or specific unit type.
   - uses computed target defense and average HP.
5. Removes killed units from defender and lost spies from attacker.

Expected result fields:
- `success`
- `spiesSent`, `spiesLost`
- `unitsKilled`
- `targetUnit`
- dynamic metadata:
  - `successProbability`
  - `probabilityModel`

### 7) Infiltration Mission Details

Function: `simulateInfiltration`

Loss curve by spy/sentry ratio:
- `<=0.5`: lose 90%
- `<=0.8`: lose 60%
- `<1.0`: lose 30%
- `<=1.2`: lose 10%
- `>1.2`: lose 0%

Mission success:
- V1 binary or V2 logistic.
- If mission fails, all sent spies are lost.

Fort damage on success:
- For each surviving infiltrator, random fort damage bucket by ratio:
  - `<=0.05`: `0..2`
  - `<=0.5`: `3..6`
  - `<=1.3`: `6..16`
  - else: `12..24`
- Fort HP is clamped at zero.

Expected result fields:
- `success`
- `spiesSent`, `spiesLost`
- `fortDmg`
- dynamic metadata:
  - `successProbability`
  - `probabilityModel`

### 8) Spy Persistence and Side Effects

Persisted in a transaction:
- defender unit updates for assassination/infiltration.
- attacker unit updates if spies were lost.
- new `attack_log` row with:
  - `type`: `INTEL|ASSASSINATE|INFILTRATE`
  - `winner` id
  - `stats.spyResults`
- stat increments:
  - attacker `SPY` won/lost
  - defender `SENTRY` won/lost

Expected spy response shape:
- `status: success|failed`
- `result`: mission-specific result object
- `attack_log`: number
- `extra_variables`: includes sent spy count and raw result.

## Known Implementation Characteristics

These are intentional/documented current behaviors:
- Battle uses deterministic hooks for simulation when RNG function is injected; production defaults to `Math.random`.
- Battle loot is additionally constrained by per-battle cap (35% of defender starting hand gold).
- Spy route and spy service both enforce some limits (layered validation).
- `Winner` assignment in `SpyService` still uses raw `attacker.spy > defender.sentry` comparison for log/stat winner attribution even when V2 probabilistic success is enabled.

## Validation Checklist

For runtime validation:
1. Send valid `POST /api/attack/{id}` and verify:
   - idempotency header required
   - success response returns `attack_log`
   - attacker and defender stats mutate as expected.
2. Send repeated identical idempotency key and verify `409`.
3. Run `POST /api/spy/{id}` for each mission and verify:
   - route-level limits are enforced
   - result payload contains expected mission fields.
4. Toggle:
   - `OT_ENABLE_BALANCE_V2=true`
   - `OT_ENABLE_BALANCE_V2=false`
   - `OT_ENABLE_BALANCE_V2=` with `OT_BALANCE_V2_ROLLOUT_PERCENT`
   and verify `probabilityModel` changes accordingly.
