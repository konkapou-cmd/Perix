# Adaptive sampling / time-aware bus inference — pre-change inspection

The accepted previous report remains untouched at
../physics-time-allocation-20261026/README.md (330 passed / 1 skipped).
Pre-change source hashes were snapshotted in the approved temporary directory
perix-adaptive-baseline-20261026. This is a limited extension of that working
tree, not a deployment or a replacement for its unpublished Google WIP.

## Findings

- tomtom_scheduler.sample_cycle uses UTC epoch //1200 Flow and //1800 Incident
  slots. run_scheduler suppresses duplicate ticks but has no regional timetable,
  holiday or DST policy. Both products need independently disabled windows.
- TrafficControl already performs lease fencing, account-wide atomic attempt
  reservations, idempotency, hard caps and terminal halt in one shared Mongo
  document. Keep its implementation and caps byte-identical. Its account-wide
  singleton is stronger than at-most-one scheduler per region/provider, within
  the existing one-active-region deployment model; do not introduce parallel
  regional budget ledgers.
- Cached provider documents replace the last point observation. There is no
  causal comparable-observation trend, independent freshness policy or point
  priority. Any history must remain within approved retention; putting older
  observations inside a newer TTL document would wrongly extend retention.
- time_allocation already rebuilds physical candidates and respects GTFS-RT
  targets, but still uses global time_scale on a chosen traffic trajectory. It
  reports three sample positions; it does not rebuild/evaluate residual travel
  from alternative current states. This can spread residual slack into free
  upstream roads. Add a bus-only, shadow-only local-slack and residual-time
  comparison using the same builders, not another motion model.
- New traffic already affects only future full edges and has a same-target
  continuity fallback. Preserve those safeguards and raw arrival/departure.
- Tram and Google builders/adapters are out of scope and will be hash-checked.
- Legal/entitlement/OpenLR gates remain unresolved. There will be no provider
  HTTP, key inspection/change, flags activation, deployment, commit or push.

## Extension plan

1. An opt-in policy loaded from active region.motion.traffic_sampling; missing
   or invalid adaptive configuration fails closed. Supply a Magdeburg example,
   not an automatically activated preset. Half-open, nonoverlapping windows.
2. Wall-clock slots in region timezone, once per nominal local slot across a
   repeated DST hour; nonexistent slots omitted. Restart performs current slot
   only, not catch-up. Verify actual calendar months and hard-cap admission.
3. Keep six fixed identities and original ordinal reservation indices despite
   priority order. Demand is scheduled, not observed vehicle motion. Unknown
   demand never becomes zero; missing history/demand cannot erase coverage.
4. Bounded independently expiring observations, strict comparable edge/binding/
   generation/time checks. Trend projections are explicitly modeled, uncertain
   and shadow-only; latest fresh evidence/baseline remains the safe fallback.
5. Localize additional model slack only on evidenced full edges before the next
   stop. Evaluate candidate residual physical/evidence travel times and causal
   origin compatibility. Evidence beyond the stop cannot explain its arrival.
6. New unit tests first, then accepted regression suites. Compare A/B/C with one
   synthetic causal observation corpus and no extra provider calls. Separate
   schedule potential from real matched coverage and accuracy from consistency.
