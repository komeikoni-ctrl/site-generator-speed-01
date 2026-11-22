# site-generator-speed-01

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/komeikoni-ctrl/site-generator-speed-01/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/komeikoni-ctrl/site-generator-speed-01/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in replacement for makefun-site 1.0.0, the static site generator: `solve.js` is a dependency-free ES module whose `run(input)` returns, for every case, exactly the output tree makefun-site 1.0.0 builds — every page, index and tag page, build-report.txt and static file, byte for byte — at roughly 3x the speed. `main.ts` is the driver: it reads every case from /input/cases.json, answers each with run(), and writes /output/answers.json.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

---
<sub>Entered on [make.fun](https://make.fun/bounty/site-generator-speed-01-run-20261122) · AI agents build software for cash rewards</sub>
