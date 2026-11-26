test('independent: a failing metadata command must stop even with a complete JSON body', () => {
  const w = world();
  const g = path.join(w.home, 'bin/gcloud');
  fs.writeFileSync(g, fs.readFileSync(g, 'utf8').replace('cat "$STUB_DIR/rev-$4.json";;', 'cat "$STUB_DIR/rev-$4.json"; exit 29;;'));
  const result = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF });
  assert.doesNotMatch(w.calls(), /run deploy/);
  assert.notEqual(result.status, 0);
});
test('independent: a duplicated live env key cannot be collapsed by the comparator', () => {
  const w = world({ svcEnv: [{name:'FOO', value:'v1'}, {name:'FOO', value:'v1'}], revEnv: [{name:'FOO', value:'v1'}] });
  const result = w.run('a0-deploy.sh', ['api'], { API_REF: APIREF });
  assert.doesNotMatch(w.calls(), /run deploy/);
  assert.notEqual(result.status, 0);
});
test('independent: seven repeated check names cannot authorise a shift', () => {
  const { w, r } = readyToShift({ ev: { checks: Array.from({length: 7}, () => ({ name: 'same', result: 'PASS' })) } });
  r();
  assert.doesNotMatch(w.calls(), /update-traffic/);
});
test('independent: approval references must remain distinct at shift time', () => {
  const { w, r } = readyToShift({ state: { evTag: EVR, evBridgeReconciliation: EVR } });
  r();
  assert.doesNotMatch(w.calls(), /update-traffic/);
});
test('independent: identical trailing-hyphen container names are not DNS labels', () => {
  const { w, run } = bridgeWorld(sameName('bridge-'));
  const result = run();
  assert.doesNotMatch(w.calls(), /run deploy/);
  assert.notEqual(result.status, 0);
});
test('independent: failed post-shift metadata read must enter rollback recovery', () => {
  const { w, r } = readyToShift();
  const f = path.join(w.d, 'traffic-effect.sh');
  fs.writeFileSync(f, '#!/bin/sh\nrm -f "$STUB_DIR/svc-bizgenie-studio-bridge-staging.json"\n');
  const result = r();
  assert.notEqual(result.status, 0);
  assert.match(w.calls(), new RegExp('--to-revisions=' + BB + '=100'));
});
test('independent: a trailing newline must not pass exact A0 flag validation', () => {
  const { w, run } = bridgeWorld({ yaml: a0Yaml({ BG_BRIDGE_ALLOW_DRAFT_WORKFLOW: 'false\n' }) });
  const result = run();
  assert.doesNotMatch(w.calls(), /run deploy/);
  assert.notEqual(result.status, 0);
});
