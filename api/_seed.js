/* Seed copied into a new shared room: the payment API design (Korean), one earlier change (Minsu, section 4) and its session.
   Same content as the library's default document; section 4's timeout is what teammates disagree on. */
export const DOC_TITLE = '결제 API 설계';

export const TIMEOUT_ORIGINAL = ['타임아웃: 30초', '재시도: 하지 않음', '중복 결제 방지: 같은 주문 번호로 온 요청은 한 번만 승인한다.'];

export const SECTIONS = [
  { id: 's1', num: 1, title: '먼저 해 볼 것', paras: [
    '> 릴레이 체험용 문서예요. 팀이 에이전트 하나로 이 문서를 함께 고쳤고, 그 과정이 그대로 남아 있어요.',
    '- 「타임아웃과 재시도」에서 이름표가 붙은 줄을 눌러 보세요. 누가, 왜 바꿨는지와 그때 에이전트와 나눈 대화가 보여요.',
    '- 토론 탭을 열어 보세요. 두 사람의 수정이 엇갈렸을 때 팀이 어떻게 정했는지 남아 있어요.',
    '- 에이전트에게 직접 물어보세요. 예: 타임아웃은 왜 지금 값이 됐어?',
  ] },
  { id: 's2', num: 2, title: '배경', paras: [
    '결제 버튼을 누른 뒤 결과가 나올 때까지 화면이 멈춰 있는 시간이 깁니다. 기다리다 떠나는 사용자가 많습니다.',
    '결제 대기 중 이탈률: 18%',
    '국내 카드 평균 승인 시간: 2초',
    '해외 카드 평균 승인 시간: 7초',
  ] },
  { id: 's3', num: 3, title: '결제 요청 흐름', paras: [
    '1. 사용자가 결제 버튼을 누른다.',
    '2. 서버가 결제 대행사에 승인을 요청한다.',
    '3. 응답이 오면 결과 화면을 보여 준다.',
    '4. 정해진 시간 안에 응답이 없으면 실패로 처리하고 안내한다.',
  ] },
  { id: 's4', num: 4, title: '타임아웃과 재시도', paras: [
    '타임아웃: 5초',
    '재시도: 하지 않음',
    '중복 결제 방지: 같은 주문 번호로 온 요청은 한 번만 승인한다.',
  ] },
  { id: 's5', num: 5, title: '실패했을 때 안내', paras: [
    '사용자에게 보이는 문구: 결제가 완료되지 않았어요. 다시 시도해 주세요.',
    '카드에서 돈이 빠져나갔는지 불안해하지 않도록, 승인되지 않았다는 사실을 함께 알려 준다.',
  ] },
  { id: 's6', num: 6, title: '성공 기준', paras: [
    '- 결제 대기 중 이탈률을 18%에서 10% 아래로 낮춘다.',
    '- 결제 성공률은 지금의 96%를 유지한다.',
  ] },
  { id: 's8', num: 7, title: 'Decision log', page: 2, paras: [
    'No decisions confirmed yet. Topics under discussion are not applied to the body until concluded.',
  ] },
];
export const NO_DECISION_PREFIX = 'No decisions confirmed yet';

/* Earlier work in the room. minutesAgo is relative to room creation. */
export const HISTORY = [
  {
    by: { id: 'bot_minsu', name: 'Minsu', avatar: 'p:minsu' }, sectionId: 's4', minutesAgo: 50,   // outside the 30-minute conflict window, so the teammate bot's edit applies cleanly
    summary: '타임아웃을 30초에서 5초로 변경',
    why: '결제 대기 중 이탈률 18%가 너무 높아서',
    prev: TIMEOUT_ORIGINAL,
    messages: [
      { role: 'user', text: '결제 대기 중 이탈률 얼마야?' },
      { role: 'agent', text: '2. 배경에 따르면 결제 대기 중 이탈률은 현재 18%예요. 6. 성공 기준에서는 이를 10% 아래로 낮추는 것을 목표로 하고 있어요.' },
      { role: 'user', text: '이탈률 18%는 너무 높아. 타임아웃을 30초에서 5초로 줄여줘.' },
      { role: 'agent', text: '4. 타임아웃과 재시도에서 타임아웃을 30초에서 5초로 줄였어요. 다만 해외 카드 평균 승인 시간이 7초라 해외 결제가 실패로 처리될 수 있으니 확인해 보세요.', applied: true },
    ],
  },
];

/* The teammate bot: Jieun asks the real agent to change section 3. Minsu only votes. */
export const BOTS = {
  jieun: { id: 'bot_jieun', name: 'Jieun', avatar: 'p:jieun' },
  minsu: { id: 'bot_minsu', name: 'Minsu', avatar: 'p:minsu' },
};
export const BOT_SECTION = 's4';
export const BOT_REQUEST = '4절 타임아웃을 15초로 늘리고, 응답이 없으면 한 번 재시도하게 바꿔줘. 해외 카드 평균 승인 시간이 7초라 5초면 해외 결제가 대부분 실패해.';
