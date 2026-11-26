# Previous Release 08 acceptance evidence, exported in full

These four Markdown files preserve the previous independent handover. They record that run's results.

The seven independent assertions are in `a0-independent-assertions.js`. To run the assertions on a corrected API #270, fetch the exact PR head into an isolated worktree. Copy the bundled test harness from the historical candidate to an untracked test file in that worktree, append the assertions, and run the named tests. Keep the file beside the bundled tests so the relative fixture paths resolve.

```bash
git show c9820e5ba39e6a1d13074a9b3dc8e4cf3ea99d73:test/release08-a0-scripts.test.js > test/.release08-independent.test.js
cat /path/to/a0-independent-assertions.js >> test/.release08-independent.test.js
node --test --test-name-pattern='independent:' test/.release08-independent.test.js
```

Run the corrected head's bundled suite separately. If the corrected head changes stub behaviour, verify that the independent assertions still exercise the same contract and record any fixture repair.
