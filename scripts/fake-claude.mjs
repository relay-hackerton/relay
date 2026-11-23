/* Deterministic stand-in for Claude in MOCK mode: enough to walk the whole judge flow without an API key.
   Built around the default document's section 4 (payment timeout): one teammate raised it, another wants it back. */
const LONG = 'Timeout: 15 seconds, with one retry if there is no response';
const SHORT = 'Timeout: 5 seconds';
const SPLIT = 'Timeout: 5 seconds for domestic cards, 15 seconds for overseas cards';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ko = (system) => /Reply language: Korean/.test(system);
const options = (K) => [
  { label: K ? '15초 + 한 번 재시도' : '15 s + one retry', labelEn: '15 s + one retry', desc: K ? '해외 카드 승인까지 기다림' : 'Wait for overseas cards', text: LONG },
  { label: K ? '5초 유지' : 'Keep 5 s', labelEn: 'Keep 5 s', desc: K ? '대기 이탈을 줄임' : 'Cut waiting drop-off', text: SHORT },
  { label: K ? '국내 5초 · 해외 15초' : 'Domestic 5 s · overseas 15 s', labelEn: 'Domestic 5 s · overseas 15 s', desc: K ? '카드 종류별로 다르게' : 'Different per card type', text: SPLIT },
];
const topic = (K) => ({ title: K ? '결제 타임아웃, 몇 초로 할까' : 'Payment timeout: how many seconds?', titleEn: 'Payment timeout: how many seconds?' });

export async function fakeClaude({ system, messages, tool }) {
  await sleep(1200);
  const K = ko(system);
  if (tool.name === 'draft_discussion') {
    return { note: K ? '지은님이 방금 해외 카드 승인 7초 때문에 타임아웃을 15초로 늘렸어요.' : 'Jieun just raised the timeout to 15 seconds because overseas cards take 7 seconds to approve.',
      discussion: { ...topic(K), question: K ? '대기 이탈을 줄이려는 5초와 해외 결제를 살리려는 15초가 부딪혀요. 어느 쪽으로 갈까요?' : '5 seconds cuts waiting drop-off; 15 seconds keeps overseas payments working. Which way do we go?', options: options(K) } };
  }
  const last = messages[messages.length - 1].content;
  const DUP = 'Duplicate payment prevention: a request with the same order number is approved only once.';   // paragraphs are written in English
  const edit = (para, reply, summary, why) => ({ reply, action: 'edit', sectionId: 's4', paras: [para, para === LONG ? 'Retry: once' : 'Retry: none', DUP], summary, why, conflict: null, discussion: null });
  if (/discussion|discuss|vote|토론|투표/i.test(last)) return { reply: K ? '4. 타임아웃과 재시도의 타임아웃 토론을 준비했어요. 주제와 선택지를 확인하고 열어 주세요.' : 'I prepared a discussion on 4. Timeout and retry. Check the topic and options, then open it.', action: 'discuss', sectionId: 's4', paras: null, summary: null, why: null, conflict: null,
    discussion: { ...topic(K), question: K ? '어느 쪽으로 갈지 정해 주세요.' : 'Decide which way to go.', options: options(K) } };
  if (/15|늘리|raise|longer/i.test(last)) return edit(LONG, K ? '4. 타임아웃과 재시도의 타임아웃을 15초로 늘리고 한 번 재시도하게 바꿨어요.' : 'Raised the timeout in 4. Timeout and retry to 15 seconds with one retry.', K ? '타임아웃을 15초 + 1회 재시도로 변경' : 'Timeout → 15 s + one retry', K ? '해외 카드 평균 승인 7초' : 'Overseas cards take 7 s to approve');
  if (/5초|5 sec|되돌|back|줄여|shorter/i.test(last)) return edit(SHORT, K ? '4. 타임아웃과 재시도의 타임아웃을 5초로 되돌렸어요.' : 'Set the timeout in 4. Timeout and retry back to 5 seconds.', K ? '타임아웃을 5초로 변경' : 'Timeout → 5 s', K ? '대기 중 이탈 18%' : '18% drop off while waiting');
  if (/changed|바뀌|요약/i.test(last)) return { reply: K ? '최근에 민수님이 4번 타임아웃을 30초에서 5초로 줄였어요.' : 'Recently Minsu cut the timeout in 4 from 30 to 5 seconds.', action: 'none', sectionId: null, paras: null, summary: null, why: null, conflict: null, discussion: null };
  return { reply: K ? '(모의 모드) 어느 섹션을 어떻게 바꿀까요?' : '(mock mode) Which section should change, and how?', action: 'clarify', sectionId: null, paras: null, summary: null, why: null, conflict: null, discussion: null };
}
