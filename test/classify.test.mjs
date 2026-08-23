/**
 * Decision-table simulation for the reason-trigger detector.
 *
 * MIRRORS the exact logic in lib/client.js (TurnChimeDetector effect):
 *  - trigger = a NEWLY-seen turn/end reason (no transition observation needed)
 *  - on mount / session switch: seed current turn number, never play history
 *  - reason while streaming is held until idle, then classified
 */
let failures = 0;
let passed = 0;
function check(label, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('  ok  ' + label);
  } else {
    failures += 1;
    console.log('  FAIL ' + label + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
  }
}

function createDetector(cfg) {
  const st = { pendingReason: null, lastEndTurn: 0, session: null };
  function push(snap) {
    if (snap.sessionId !== st.session) {
      st.session = snap.sessionId;
      st.pendingReason = null;
      st.lastEndTurn = snap.endTurn;
      return { play: false, reason: 'seeded' };
    }
    if (snap.endTurn > st.lastEndTurn) {
      st.lastEndTurn = snap.endTurn;
      if (snap.endReason !== null) st.pendingReason = snap.endReason;
    }
    if (snap.streaming) return { play: false, reason: 'streaming' };
    if (st.pendingReason === null) return { play: false, reason: 'no-reason' };
    const reason = st.pendingReason;
    st.pendingReason = null;

    let kind;
    if (reason === 'aborted' || reason === 'blocked') kind = 'interrupt';
    else if (reason === 'error' || reason === 'max-tokens') kind = 'error';
    else kind = 'normal';

    let play = false;
    if (kind === 'interrupt') play = cfg.playOnInterrupt;
    else if (kind === 'error') play = cfg.playOnError;
    else play = true;
    return { play, reason: kind };
  }
  return { push, st };
}

const S = 'sess-A';
const snap = (opts) => ({ sessionId: S, streaming: opts.streaming === true, endReason: opts.reason ?? null, endTurn: opts.turn ?? 0 });

console.log('== 1. normal completion (incl. fast turns with no streaming observed) ==');
{
  const d = createDetector({ playOnInterrupt: false, playOnError: false });
  d.push(snap({ streaming: false, turn: 1 })); // mount, idle (seeded at 1)
  d.push(snap({ streaming: true, turn: 1 }));
  let r = d.push(snap({ streaming: false, reason: 'completed', turn: 2 }));
  check('normal completion -> plays even with switches off', r.play === true, r);
}
{
  // fast turn: streaming=true never observed between idle snapshots
  const d = createDetector({ playOnInterrupt: false, playOnError: false });
  d.push(snap({ streaming: false, turn: 0 })); // mount (seed 0)
  let r = d.push(snap({ streaming: false, reason: 'completed', turn: 1 }));
  check('fast turn (no streaming snapshot) -> still plays', r.play === true, r);
}

console.log('== 2. ERROR path (the switch pair) ==');
{
  const d = createDetector({ playOnInterrupt: false, playOnError: true });
  d.push(snap({ streaming: false, turn: 1 }));
  d.push(snap({ streaming: true, turn: 1 }));
  let r = d.push(snap({ streaming: false, reason: 'error', turn: 2 }));
  check('error + playOnError ON -> plays', r.play === true, r);
}
{
  const d = createDetector({ playOnInterrupt: false, playOnError: false });
  d.push(snap({ streaming: false, turn: 1 }));
  d.push(snap({ streaming: true, turn: 1 }));
  let r = d.push(snap({ streaming: false, reason: 'error', turn: 2 }));
  check('error + playOnError OFF -> silent', r.play === false, r);
}
{
  const d = createDetector({ playOnInterrupt: false, playOnError: false });
  d.push(snap({ streaming: false, turn: 1 }));
  let r = d.push(snap({ streaming: false, reason: 'max-tokens', turn: 2 }));
  check('max-tokens + playOnError OFF -> silent', r.play === false, r);
}

console.log('== 3. ERROR race: reason arrives in a later snapshot ==');
{
  const d = createDetector({ playOnInterrupt: false, playOnError: false });
  d.push(snap({ streaming: false, turn: 1 })); // mount seed (lastEndTurn=1)
  d.push(snap({ streaming: true, turn: 1 })); // turn 2 running, turn/end not processed yet
  let r1 = d.push(snap({ streaming: false, turn: 1 })); // idle; timeline still shows endTurn=1
  check('idle without new endTurn -> no trigger', r1.play === false && r1.reason === 'no-reason', r1);
  let r2 = d.push(snap({ streaming: false, reason: 'error', turn: 2 })); // turn/end now visible
  check('reason=error arrives late + playOnError OFF -> silent', r2.play === false, r2);
}
{
  const d = createDetector({ playOnInterrupt: false, playOnError: true });
  d.push(snap({ streaming: false, turn: 1 }));
  d.push(snap({ streaming: true, turn: 1 }));
  d.push(snap({ streaming: false, turn: 1 }));
  let r2 = d.push(snap({ streaming: false, reason: 'error', turn: 2 }));
  check('reason=error arrives late + playOnError ON -> plays', r2.play === true, r2);
}

console.log('== 4. INTERRUPT path ==');
{
  const d = createDetector({ playOnInterrupt: false, playOnError: true });
  d.push(snap({ streaming: false, turn: 1 }));
  d.push(snap({ streaming: true, turn: 1 }));
  let r = d.push(snap({ streaming: false, reason: 'aborted', turn: 2 }));
  check('interrupt + switch OFF -> silent', r.play === false, r);
}
{
  const d = createDetector({ playOnInterrupt: true, playOnError: true });
  d.push(snap({ streaming: false, turn: 1 }));
  d.push(snap({ streaming: true, turn: 1 }));
  let r = d.push(snap({ streaming: false, reason: 'aborted', turn: 2 }));
  check('interrupt + switch ON -> plays', r.play === true, r);
}

console.log('== 5. mount / history must NOT trigger ==');
{
  const d = createDetector({ playOnInterrupt: false, playOnError: true });
  // mount on an idle session whose history already has completed turns
  let r = d.push(snap({ streaming: false, reason: 'completed', turn: 7 }));
  check('mount on history -> silent (seeded, no replay)', r.play === false && r.reason === 'seeded', r);
  // subsequent real turn completes -> plays
  d.push(snap({ streaming: true, turn: 7 }));
  r = d.push(snap({ streaming: false, reason: 'completed', turn: 8 }));
  check('subsequent real completion -> plays', r.play === true, r);
}

console.log('== 6. reason seen while streaming is held, played at idle ==');
{
  const d = createDetector({ playOnInterrupt: false, playOnError: false });
  d.push(snap({ streaming: false, turn: 1 }));
  // abnormal: turn/end visible while still streaming
  let r1 = d.push(snap({ streaming: true, reason: 'completed', turn: 2 }));
  check('reason while streaming -> held, not played', r1.play === false && r1.reason === 'streaming', r1);
  let r2 = d.push(snap({ streaming: false, turn: 2 }));
  check('held reason played once idle', r2.play === true, r2);
}

console.log('== 7. session switch must not leak ==');
{
  const d = createDetector({ playOnInterrupt: false, playOnError: true });
  d.push(snap({ streaming: false, turn: 1 }));
  d.push(snap({ streaming: true, turn: 1 }));
  d.push(snap({ streaming: false, reason: 'completed', turn: 2 })); // played, lastEndTurn=2
  let r = d.push({ sessionId: 'sess-B', streaming: false, endReason: 'completed', endTurn: 1 });
  check('other session mount -> silent (seeded)', r.play === false && r.reason === 'seeded', r);
  d.push({ sessionId: 'sess-B', streaming: true, endReason: null, endTurn: 1 });
  r = d.push({ sessionId: 'sess-B', streaming: false, endReason: 'aborted', endTurn: 2 });
  check('other session interrupt + switch OFF -> silent (fresh reason honored)', r.play === false, r);
}

console.log('\npassed=' + passed + ' failed=' + failures);
process.exit(failures === 0 ? 0 : 1);
