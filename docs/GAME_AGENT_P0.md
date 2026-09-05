# KAI Play Game Agent P0

## Objective

The first agent iteration turns KAI Farm into a deterministic long-horizon benchmark. The agent observes a fused packet containing screen semantics or an optional frame reference, UI text, structured game state, and recent actions. It then maintains a goal, decomposes it into phases, chooses a reusable skill, executes one environment action, reflects on feedback, records episodic memory, and replans.

## Implemented capability

- Long-horizon objective: finish the nine-day season with at least 330 coins.
- Executable hierarchical plan: unlock carrot, unlock strawberry, complete the gold harvest. Each decision enumerates legal Skill/action candidates; the selected candidate, rank, trigger and plan revision are stored in the trajectory.
- Skill library with explicit preconditions and effects.
- Recent trajectory context plus browser-local episodic memory (bounded to the latest 20 completed runs).
- Successful trajectories are compressed into ordered Skill macros, aggregated by policy, retrieved on the next `skill_memory` run, and checked against the live Skill sequence. This proves retrieval usage but does not yet let the macro override the action policy.
- Reflection and recovery after a rejected environment action.
- Deterministic trajectory records containing observation, goal, subgoal, plan identity/revision, candidate rank, skill, action, reasoning, before/after state, and outcome.
- Offline comparison of a myopic baseline, a hierarchical planner, and a Skill + Memory planner.
- Metrics: task success, final coins, medal, skill coverage, invalid-action rate, recovery rate, decisions, and an observation-size token estimate.

Run the benchmark:

```bash
npm run agent:eval
npm run agent:eval -- --json
```

The same command now emits a separate memory-transfer block: one discovery run, one clean replay using the retrieved macro, and one replay with a rejected action. This prevents “memory exists” from being treated as evidence of reuse without a measurable retrieval path.

## Verified deterministic baseline

| Policy | Normal task | Recovery task | Final coins |
|---|---:|---:|---:|
| Myopic wheat baseline | Fail | Fail | 151 |
| Hierarchical planner | Pass | Pass | 346 |
| Skill + Memory planner | Pass | Pass | 346 |

The deterministic memory-transfer check extracts an 18-step Skill macro from the successful route. Clean replay and planned-action rejection recovery both match all 18 macro steps and still finish at 346 coins; this is a same-environment retrieval-and-sequence check, not evidence that the macro improved reward or generalized across games.

The recovery evaluation rejects one selected legal candidate at a fixed step. The environment remains unchanged; the agent records and excludes that action id for the same state, produces a new plan, executes the next ranked legal candidate, and completes the season. A separate legacy fault fixture still covers malformed-action rejection. In the browser, a completed episode is saved under `kai.play.agent.memory.v1`; malformed data is sanitized on restore, storage is capped at 20 episodes/macros, and the user can clear it from Agent Lab. Nothing is uploaded or shared across devices.

## In-game integration

The actual KAI Farm route now exposes two player-authorized controls: **帮我走一步** and **开始托管 / 暂停托管**. This is not a second demonstration board. A session is created from the current live farm snapshot, and every successful Agent action is committed through the existing farm update and local-save path. The first delegated action begins immediately. With VLM guard enabled, later actions are spaced at 5.2 seconds so the client stays within the server's 12-observations-per-minute ceiling. Manual farm controls are temporarily locked only while a step is running; pausing, leaving the route, hiding the page, or detecting a newer save from another tab stops continuous execution.

When the VLM endpoint reports ready, each in-game action requests a fresh raster observation and uses `guard` mode. A mismatch, unavailable observation, stale `frameRevision`, or structured-state conflict records a guarded trajectory entry and stops before game-state mutation. When the endpoint is disabled, the game labels the mode **结构化模式** and executes against rule state without pretending that a visual model ran. An Agent-completed season adds a compact result review with decisions, Skill coverage, visual checks, visual blocks and local-memory status; the full plan, Skill, Memory, failure-injection and evaluation surfaces remain in Agent Lab.

## Claim boundary

The additive [Skill self-improvement pass](GAME_SKILL_EVOLUTION.md) now repairs a specific planting-deadline failure from trajectories using two bounded candidate templates, isolated non-regression checks, versioned local memory, and runtime rollback. Unlike macro matching, accepted revisions change actions. This is constrained policy repair, not unrestricted learned Skill Discovery; the P0 baseline and model boundaries below still apply.

P0 remains a deterministic, reproducible policy baseline. The provider seam can send a real raster observation to Kai's separately hosted ScienceQA VLM, map its bounded choice back into a structured farm state, and display agreement, latency and measured token use. Agent Lab defaults to `shadow` mode; the real farm route automatically uses `guard` whenever the endpoint is ready. Guard mode stops an action before state mutation when the visual choice disagrees with RPC truth or the provider is unavailable, then records a conflict and replan. This safety gate does **not** turn the VLM into the action policy and does not establish game-domain accuracy. The ordered Skill macro is transparent trajectory summarization and retrieval—not learned Skill Discovery, SFT/RL training, or a neural policy. There is still no LLM planner, production model-serving result, MCTS, or World Model.

The next research gate is to freeze a KAI Farm screenshot evaluation set and compare screenshot-only, shadow and guarded hybrid observations under the same latency/cost budget. Guard mode is currently a conservative consistency gate, not evidence that the ScienceQA adapter improves task success. See `VLM_INTEGRATION.md` for the bridge and license boundary.
