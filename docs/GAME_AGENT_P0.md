# KAI Play Game Agent P0

## Objective

The first agent iteration turns KAI Farm into a deterministic long-horizon benchmark. The agent observes a fused packet containing screen semantics or an optional frame reference, UI text, structured game state, and recent actions. It then maintains a goal, decomposes it into phases, chooses a reusable skill, executes one environment action, reflects on feedback, records episodic memory, and replans.

## Implemented capability

- Long-horizon objective: finish the nine-day season with at least 330 coins.
- Hierarchical plan: unlock carrot, unlock strawberry, complete the gold harvest.
- Skill library with explicit preconditions and effects.
- Recent trajectory context and episodic success/failure memory.
- Reflection and recovery after a rejected environment action.
- Deterministic trajectory records containing observation, goal, subgoal, skill, action, reasoning, before/after state, and outcome.
- Offline comparison of a myopic baseline, a hierarchical planner, and a Skill + Memory planner.
- Metrics: task success, final coins, medal, skill coverage, invalid-action rate, recovery rate, decisions, and an observation-size token estimate.

Run the benchmark:

```bash
npm run agent:eval
npm run agent:eval -- --json
```

## Verified deterministic baseline

| Policy | Normal task | Recovery task | Final coins |
|---|---:|---:|---:|
| Myopic wheat baseline | Fail | Fail | 151 |
| Hierarchical planner | Pass | Pass | 346 |
| Skill + Memory planner | Pass | Pass | 346 |

The recovery task injects one invalid action at a fixed step. The environment rejects it without mutation; the agent records the failure, replans, and completes the season.

## Claim boundary

P0 is a deterministic, reproducible agent framework and browser visualization. It does **not** claim external LLM/VLM inference, screenshot understanding by a trained vision model, learned Skill Discovery, SFT/RL training, online model-serving performance, or a World Model. The observation and policy interfaces are structured so those providers can be evaluated later without rewriting the game rules.

The next research gate is to add a real screenshot-only and hybrid VLM provider, freeze an evaluation split, and compare it against the structured-state baseline under the same latency and token budget.
