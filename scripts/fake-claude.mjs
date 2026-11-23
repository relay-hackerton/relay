/* Deterministic stand-in for Claude in MOCK mode: enough to walk the whole judge flow without an API key. */
const EACH = 'Payment: each person pays their own share when they add items, and the delivery fee is split evenly.';
const ORGANIZER = 'Payment: the organizer pays the full amount at checkout and collects each person\'s share afterward.';
const HYBRID = 'Payment: the organizer pays at checkout by default, and the app sends each member a payment request for their share.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ko = (system) => /Reply language: Korean/.test(system);
const sectionParas = (system, id) => {
  const m = system.match(new RegExp(`\\[${id}\\][^\\n]*\\n((?:  \\(\\d+\\)[^\\n]*\\n?)+)`));
  return m ? m[1].trim().split('\n').map((l) => l.replace(/^\s*\(\d+\)\s/, '')) : [];
};

export async function fakeClaude({ system, messages, tool }) {
  await sleep(1200);
  const K = ko(system);
  if (tool.name === 'draft_discussion') {
    return { note: K ? '지은님이 방금 결제 단계 이탈 38% 때문에 각자 결제로 바꿨어요.' : 'Jieun just changed this to each person paying because 38% of carts drop at the payment step.',
      discussion: { title: K ? '단체 주문 결제, 주문자가 할까 각자 할까' : 'Group order payment: organizer or each person?', titleEn: 'Group order payment: organizer or each person?',
        question: K ? '이탈을 줄이려는 각자 결제와 결제를 한 번에 끝내려는 주문자 결제가 부딪혀요. 어느 쪽으로 갈까요?' : 'Each person paying cuts drop-off; the organizer paying keeps checkout to one payment. Which way do we go?',
        options: [
          { label: K ? '각자 결제 유지' : 'Each person pays', labelEn: 'Each person pays', desc: K ? '담을 때 각자 결제, 배달비 균등 분할' : 'Pay when adding items, split delivery evenly', text: EACH },
          { label: K ? '주문자 결제로 전환' : 'Organizer pays', labelEn: 'Organizer pays', desc: K ? '주문자가 결제하고 나중에 받기' : 'Organizer pays, collects later', text: ORGANIZER },
          { label: K ? '주문자 결제 + 송금 요청' : 'Organizer pays + payment requests', labelEn: 'Organizer pays + payment requests', desc: K ? '앱이 멤버에게 송금 요청을 보냄' : 'The app sends each member a request', text: HYBRID },
        ] } };
  }
  const last = messages[messages.length - 1].content;
  const s3 = sectionParas(system, 's3');
  const edit = (para, reply, summary, why) => ({ reply, action: 'edit', sectionId: 's3', paras: [s3[0], para, s3[2]], summary, why, conflict: null, discussion: null });
  if (/discussion|discuss|vote|토론/i.test(last)) return { reply: K ? '3. 핵심 기능의 결제 방식 토론을 준비했어요. 주제와 선택지를 확인하고 열어 주세요.' : 'I prepared a discussion on 3. Core features. Check the topic and options, then open it.', action: 'discuss', sectionId: 's3', paras: null, summary: null, why: null, conflict: null,
    discussion: { title: K ? '단체 주문 결제, 주문자가 할까 각자 할까' : 'Group order payment: organizer or each person?', titleEn: 'Group order payment: organizer or each person?', question: K ? '어느 쪽으로 갈지 정해 주세요.' : 'Decide which way to go.',
      options: [{ label: K ? '각자 결제 유지' : 'Each person pays', labelEn: 'Each person pays', desc: '', text: EACH }, { label: K ? '주문자 결제로 전환' : 'Organizer pays', labelEn: 'Organizer pays', desc: '', text: ORGANIZER }, { label: K ? '주문자 결제 + 송금 요청' : 'Organizer pays + payment requests', labelEn: 'Organizer pays + payment requests', desc: '', text: HYBRID }] } };
  if (/own share|각자/i.test(last)) return edit(EACH, K ? '3. 핵심 기능의 결제를 각자 결제로 바꿨어요.' : 'Switched payment in 3. Core features to each person paying their own share.', K ? '결제를 각자 결제로 변경' : 'Payment → each person pays', K ? '결제 단계 이탈 38%' : '38% of carts drop at payment');
  if (/organizer|주문자/i.test(last)) return edit(ORGANIZER, K ? '3. 핵심 기능의 결제를 주문자 결제로 바꿨어요.' : 'Switched payment in 3. Core features back to the organizer paying.', K ? '결제를 주문자 결제로 변경' : 'Payment → organizer pays', K ? '결제를 한 번에 끝내야 한다' : 'Checkout should stay one payment');
  if (/changed|바뀌|요약/i.test(last)) return { reply: K ? '최근 30분: 민수님이 2번 목표를 수치로 바꿨고, 지은님이 5번에 단체 장바구니 완료율을 넣었어요.' : 'Last 30 minutes: Minsu made the goals in 2 measurable, and Jieun added group cart completion to 5.', action: 'none', sectionId: null, paras: null, summary: null, why: null, conflict: null, discussion: null };
  return { reply: K ? '(모의 모드) 어느 섹션을 어떻게 바꿀까요?' : '(mock mode) Which section should change, and how?', action: 'clarify', sectionId: null, paras: null, summary: null, why: null, conflict: null, discussion: null };
}
