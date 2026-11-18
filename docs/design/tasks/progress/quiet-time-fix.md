# quiet-time-fix progress
Started. Nothing done yet.
## 2026-11 session 1
Done (edited, not yet tested): progression/alerts.ts eased bug (finding 2); human/alerts.ts cooldown log once per event+site, backwards expire loop (7,9);
tools/sim/quietRun.ts target=quietShareMin + finish() closes open stays (3,4); quiet.long.test.ts threat clause + DIFFICULTY_PARAMS + skipIf (1,8).
Remaining: add cooldown-log test, run tests (human/, progression/alerts*), typecheck, perf.verify with FOUNDRESS_LONG=1, GDD 06 §4.5 note, update report docs/design/tasks/quiet-time-report.md.
tests for fixes added: alerts.test.ts cooldown log, quietRun.stay.test.ts; reviewer tests green. Next: typecheck, human folder, progression folder, perf LONG, report update
perf.verify LONG passes; human/ and progression/ folders green. Running quiet.long (kitchen-door harsh case) once then update report
report partially updated (sections 2,4,7,8); waiting for quiet.long background run (log test-output/quiet-time/long/fix-run.log), then update §5/§6 numbers + threats started, final answer
