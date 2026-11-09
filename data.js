/* Seed data for the prototype, in English and Korean. Times are relative to page load. */
window.SEED = (() => {
  const lang = window.RELAY_LANG === 'ko' ? 'ko' : 'en';
  const now = Date.now();
  const min = (m) => new Date(now - m * 60000);
  const pick = (en, ko) => (lang === 'ko' ? ko : en);

  const MEMBERS = {
    me:      { id: 'me',      name: pick('Chaewon', '채원'), color: '#D9503B', role: pick('Planning', '기획'),    photo: 'img/me.jpg' },
    minsu:   { id: 'minsu',   name: pick('Minsu', '민수'),   color: '#2E6BE0', role: pick('Engineering', '개발'), photo: 'img/minsu.jpg' },
    jieun:   { id: 'jieun',   name: pick('Jieun', '지은'),   color: '#1E9A66', role: pick('Design', '디자인'),    photo: 'img/jieun.jpg' },
    hyunwoo: { id: 'hyunwoo', name: pick('Hyunwoo', '현우'), color: '#D28B0A', role: pick('Data', '데이터'),      photo: 'img/hyunwoo.jpg' },
    agent:   { id: 'agent',   name: pick('Agent', '에이전트'), color: '#4F43D6',
               photo: 'img/agent-basic.png', photos: { idle: 'img/agent-basic.png', working: 'img/agent-working.png', waiting: 'img/agent-waiting.png' } },
  };

  const DOC_EN = {
    title: 'New workspace onboarding proposal', version: 'v0.4', footer: 'RELAY · Onboarding proposal',
    lede: 'A workspace that does not gather a team within 7 days does not survive. We redesign the invite step.',
    invitePrefix: 'Team invite:', noDecisionPrefix: 'No decisions confirmed yet',
    sections: [
      { id: 's1', num: 1, title: 'Background', paras: [
        'Of 1,240 new workspaces last quarter, only 31% had a second member join within 7 days. Solo workspaces keep 12% at day 30, a quarter of workspaces with two or more members (54%).',
        'Onboarding today has four steps: sign up → name the workspace → invite teammates → create the first project. The invite step loses 41%, the most of any step.',
      ]},
      { id: 's2', num: 2, title: 'Goals', paras: [
        'Raise 7-day activation (second member joins + first task created) from 32% to 45%.',
        'Cut the median time from sign-up to first task from 2 days 14 hours to under 24 hours.',
      ], footnote: 'Baselines from the product dashboard, last 30 days.' },
      { id: 's3', num: 3, title: 'Core features', paras: [
        'Template pick: default boards and sample tasks per team type (product · marketing · ops).',
        'Team invite: with contacts permission (Google · Slack), auto-invite members on the same domain. The permission screen can be skipped.',
        'First-task guide: complete a sample task to learn the core actions (assign · change status · comment).',
      ]},
      { id: 's4', num: 4, title: 'User flow', steps: true, paras: [
        'Sign up → pick a template → invite teammates → complete the sample task → create my first task',
        'Each step must finish within 30 seconds and can be skipped at any point.',
      ]},
      { id: 's5', num: 5, title: 'Success metrics', page: 2, paras: [
        '7-day activation 45% (baseline 32%)',
        'Median time to first task under 24 hours (baseline 2 days 14 hours)',
      ]},
      { id: 's6', num: 6, title: 'Timeline', page: 2, paras: [
        'Design locked week 2 of Nov · build weeks 3–4 of Nov · 10% rollout week 1 of Dec · metrics review week 2 of Dec',
      ]},
      { id: 's7', num: 7, title: 'Roles', page: 2, paras: [
        'Chaewon: problem definition and onboarding flow design',
        'Minsu: implementation and rollout',
        'Jieun: screen design and usability testing',
        'Hyunwoo: metric design and analysis',
        'Agent: applies teammate sessions and discussion results to this document',
      ]},
      { id: 's8', num: 8, title: 'Decision log', page: 2, paras: [
        'No decisions confirmed yet. Topics under discussion are not applied to the body until concluded.',
      ]},
    ],
  };
  const DOC_KO = {
    title: '신규 워크스페이스 온보딩 개선안', version: 'v0.4', footer: 'RELAY · 온보딩 개선안',
    lede: '첫 7일 안에 팀이 모이지 않으면 워크스페이스는 살아남지 못한다. 초대 단계를 다시 설계한다.',
    invitePrefix: '팀원 초대:', noDecisionPrefix: '확정된 결정이 아직',
    sections: [
      { id: 's1', num: 1, title: '배경', paras: [
        '지난 분기 신규 워크스페이스 1,240개 중 7일 안에 두 번째 멤버가 들어온 곳은 31%에 그쳤다. 혼자 쓰는 워크스페이스의 30일 유지율은 12%로, 2명 이상인 곳(54%)의 4분의 1 수준이다.',
        '현재 온보딩은 가입 → 워크스페이스 이름 → 팀원 초대 → 첫 프로젝트 생성의 4단계이며, 팀원 초대 단계에서 41%가 이탈해 가장 크다.',
      ]},
      { id: 's2', num: 2, title: '목표', paras: [
        '7일 활성화율(두 번째 멤버 합류 + 첫 작업 생성)을 32%에서 45%로 올린다.',
        '가입 후 첫 작업 생성까지 걸리는 시간의 중앙값을 2일 14시간에서 24시간 이내로 줄인다.',
      ], footnote: '기준선은 최근 30일 제품 대시보드 기준.' },
      { id: 's3', num: 3, title: '핵심 기능', paras: [
        '템플릿 선택: 팀 유형(제품·마케팅·운영)별 기본 보드와 샘플 작업을 제공한다.',
        '팀원 초대: 연락처(Google·Slack) 권한을 받아 같은 도메인의 멤버를 자동으로 초대한다. 권한 화면은 건너뛸 수 있다.',
        '첫 작업 안내: 샘플 작업을 완료하는 흐름으로 핵심 동작(담당자 지정·상태 변경·댓글)을 익힌다.',
      ]},
      { id: 's4', num: 4, title: '사용자 흐름', steps: true, paras: [
        '가입 → 템플릿 선택 → 팀원 초대 → 샘플 작업 완료 → 내 첫 작업 만들기',
        '각 단계는 30초 안에 끝나야 하며, 어느 단계에서든 건너뛸 수 있다.',
      ]},
      { id: 's5', num: 5, title: '성공 지표', page: 2, paras: [
        '7일 활성화율 45% (기준 32%)',
        '첫 작업 생성까지 중앙값 24시간 이내 (기준 2일 14시간)',
      ]},
      { id: 's6', num: 6, title: '일정', page: 2, paras: [
        '11월 2주 설계 확정 · 11월 3~4주 구현 · 12월 1주 10% 롤아웃 · 12월 2주 지표 검토',
      ]},
      { id: 's7', num: 7, title: '역할', page: 2, paras: [
        '채원: 문제 정의와 온보딩 흐름 설계',
        '민수: 구현과 롤아웃 운영',
        '지은: 화면 설계와 사용성 검증',
        '현우: 지표 설계와 분석',
        '에이전트: 팀원 세션과 토론 결론을 이 문서에 반영',
      ]},
      { id: 's8', num: 8, title: '결정 기록', page: 2, paras: [
        '확정된 결정이 아직 없다. 토론 중인 내용은 결론이 나기 전까지 본문에 반영하지 않는다.',
      ]},
    ],
  };
  const DOC = pick(DOC_EN, DOC_KO);

  /* Sessions other members already had with the agent */
  const SESSIONS = {
    ses_minsu: { id: 'ses_minsu', by: 'minsu', at: min(25), title: pick('Make the goals measurable', '목표를 측정 가능하게'), messages: [
      { role: 'user',  text: pick('Section 2 goals are too abstract. Rewrite them with targets based on the dashboard numbers.', '2번 목표가 너무 추상적이야. 지금 대시보드 숫자 기준으로 목표치를 잡아서 다시 써줘.') },
      { role: 'agent', text: pick("Last 30 days: 7-day activation is 32% and the median time to first task is 2 days 14 hours. I'll use those as baselines and target 45% / under 24 hours, with the source in a footnote.", '최근 30일 기준 7일 활성화율이 32%, 첫 작업 생성까지 중앙값이 2일 14시간이에요. 이 둘을 기준선으로 잡고 45% / 24시간 이내를 목표로 쓸게요. 근거는 각주로 남길게요.') },
      { role: 'user',  text: pick('Good, do that.', '좋아, 그렇게 해줘.') },
      { role: 'agent', text: pick('Updated 2. Goals.', '2. 목표를 수정했어요.'), applied: 's2' },
    ]},
    ses_jieun: { id: 'ses_jieun', by: 'jieun', at: min(10), title: pick('Remove input from the invite step', '초대 단계 입력 없애기'), messages: [
      { role: 'user',  text: pick('The onboarding funnel loses 41% at the invite step. Rewrite section 3 so this step needs no typing.', '온보딩 퍼널 보면 팀원 초대 단계에서 41%가 빠져. 이 단계에서 입력을 없애는 쪽으로 3번 핵심 기능을 수정해줘.') },
      { role: 'agent', text: pick('We could ask for contacts permission (Google · Slack) and auto-invite same-domain members. That adds one permission screen. Go ahead?', '연락처(Google·Slack) 권한을 받아 같은 도메인 멤버를 자동 초대하는 안으로 쓸 수 있어요. 대신 권한 요청 화면이 하나 늘어나요. 그래도 진행할까요?') },
      { role: 'user',  text: pick('Yes. Make the permission screen skippable.', '응. 권한 화면은 건너뛸 수 있게 해줘.') },
      { role: 'agent', text: pick('Changed "Team invite" in 3. Core features to auto-invite, with a skip option.', '3. 핵심 기능의 "팀원 초대"를 자동 초대 방식으로 바꿨어요. 건너뛰기 옵션도 넣었어요.'), applied: 's3' },
    ]},
    ses_minsu2: { id: 'ses_minsu2', by: 'minsu', at: null, title: pick('Two-stage rollout', '롤아웃을 두 단계로'), messages: [
      { role: 'user',  text: pick('In section 6, a 10% rollout in week 1 of December is too big. Start at 5% and go to 25% in week 2.', '6번 일정에서 12월 1주 10% 롤아웃은 너무 커. 5%로 시작하고 2주차에 25%까지 가는 걸로 바꿔줘.') },
      { role: 'agent', text: pick('Done. The metrics review now sits in the same week as the 25% stage.', '바꿨어요. 지표 검토는 25% 단계와 같은 주에 두었어요.'), applied: 's6' },
    ]},
    ses_hyunwoo: { id: 'ses_hyunwoo', by: 'hyunwoo', at: null, title: pick('Add invite acceptance rate', '초대 수락률 지표 추가'), messages: [
      { role: 'user',  text: pick('Add invite acceptance rate to section 5: the share of invites that sign up within 7 days.', '5번 지표에 초대 수락률을 추가해줘. 초대 보낸 것 중 7일 안에 가입한 비율로.') },
      { role: 'agent', text: pick("Added. Last month's baseline was 58%, so the target is 65%.", '추가했어요. 지난달 기준선은 58%라 목표는 65%로 잡았어요.'), applied: 's5' },
    ]},
  };

  const CHANGES = {
    s2: { by: 'minsu', at: min(25), sessionId: 'ses_minsu', likes: [],
      summary: pick('Rewrote both goals as dashboard baselines with numeric targets', '목표 2개를 대시보드 기준선과 수치 목표로 바꿈'),
      why: pick('Asked to replace "too abstract" goals with current numbers as baselines', '"너무 추상적"이라 현재 숫자를 기준선으로 잡아 달라고 요청'),
      prev: pick(['Make it easy for new users to form a team and reach a first result quickly.', 'Increase onboarding completion.'],
                 ['신규 사용자가 쉽게 팀을 구성하고 빠르게 첫 성과를 경험하게 한다.', '온보딩 완료율을 높인다.']) },
    s3: { by: 'jieun', at: min(10), sessionId: 'ses_jieun', likes: ['minsu'],
      summary: pick('Changed team invite from email entry to contacts-based auto-invite', '팀원 초대를 이메일 입력에서 연락처 기반 자동 초대로 변경'),
      why: pick('41% drop off at the invite step; decided to remove the input entirely', '초대 단계 이탈 41%. 입력 자체를 없애자는 판단'),
      prev: [DOC.sections[2].paras[0],
             pick('Team invite: enter emails to invite teammates. Copying an invite link is also supported.', '팀원 초대: 이메일을 입력해 팀원을 초대한다. 초대 링크 복사도 지원한다.'),
             DOC.sections[2].paras[2]] },
  };

  /* The invite paragraph in section 3, in each form the discussion can land on */
  const INVITE = {
    auto:   DOC.sections[2].paras[1],
    manual: pick('Team invite: invite teammates directly by email or an invite link.', '팀원 초대: 이메일 입력 또는 초대 링크로 팀원을 직접 초대한다.'),
    hybrid: pick('Team invite: direct invite by email or link by default. If contacts permission is granted, same-domain members appear as suggestions that can be invited in one go.',
                 '팀원 초대: 기본은 이메일·링크로 직접 초대한다. 연락처 권한을 허용한 경우 같은 도메인 멤버를 제안 목록으로 보여 주고, 한 번에 선택해 초대할 수 있다.'),
  };

  const DISCUSSION_TEMPLATE = {
    sectionId: 's3',
    title: pick('Team invite: automatic or manual?', '팀원 초대, 자동으로 할까 직접 하게 할까'),
    question: pick('Jieun switched to auto-invite to cut drop-off; Chaewon switched to manual because the permission request feels heavy. Decide which way to go. Once concluded, the agent applies it to section 3 as is.',
                   '지은님은 이탈을 줄이려 자동 초대로, 채원님은 권한 요청이 부담이라 수동 초대로 바꿨어요. 어느 쪽으로 갈지 정해 주세요. 결론이 나면 에이전트가 3번을 그대로 반영합니다.'),
    options: [
      { id: 'A', label: pick('Keep auto-invite', '자동 초대 유지'), desc: pick('Contacts permission → auto-invite same domain', '연락처 권한 → 같은 도메인 자동 초대'), text: INVITE.auto },
      { id: 'B', label: pick('Switch to manual invite', '수동 초대로 전환'), desc: pick('Invite directly by email · link', '이메일·링크로 직접 초대'), text: INVITE.manual },
      { id: 'C', label: pick('Manual by default + suggestions', '수동 기본 + 멤버 제안'), desc: pick('Suggest same-domain members only if permission is granted', '권한 허용 시 같은 도메인 멤버를 제안만'), text: INVITE.hybrid },
    ],
    simulatedVotes: [
      { after: 2800, by: 'minsu',   option: 'C', text: pick('A permission screen is one more place to drop off. Suggestions only feels safer.', '권한 요청 화면이 생기면 거기서 또 빠질 것 같아요. 제안만 띄우는 게 안전해 보여요.') },
      { after: 6200, by: 'jieun',   option: 'C', text: pick('Funnel-wise auto is strongest, but suggestions for people who granted permission works for me too.', '퍼널만 보면 자동이 제일 세긴 한데, 권한 허용한 사람한테만 제안이면 저도 괜찮아요.') },
      { after: 9400, by: 'hyunwoo', option: 'B', text: pick('The data says the problem is acceptance rate, not invite count. Blasting auto-invites would push acceptance down further.', '데이터상 문제는 초대 수보다 수락률이에요. 자동으로 뿌리면 수락률만 더 떨어질 것 같아요.') },
    ],
    genericVote: pick('{label} seems right to me.', '{label} 쪽이 맞는 것 같아요.'),
  };

  /* Simulated teammate activity after the workspace opens */
  const SIM = {
    hyunwoo: { para: pick('Invite acceptance rate 65% (baseline 58%) · share of invites that sign up within 7 days', '초대 수락률 65% (기준 58%) · 초대 후 7일 안에 가입한 비율'),
      summary: pick('Added invite acceptance rate (target 65%, baseline 58%)', '초대 수락률 지표 추가 (목표 65%, 기준 58%)'),
      why: pick('Data says acceptance rate, not invite count, is the problem', '초대 수가 아니라 수락률이 문제라는 데이터 판단') },
    minsu: { para: pick('Design locked week 2 of Nov · build weeks 3–4 of Nov · 5% rollout week 1 of Dec · 25% rollout + metrics review week 2 of Dec', '11월 2주 설계 확정 · 11월 3~4주 구현 · 12월 1주 5% 롤아웃 · 12월 2주 25% 롤아웃 + 지표 검토'),
      summary: pick('Changed rollout from a single 10% to two stages, 5% → 25%', '롤아웃을 10% 한 번에서 5% → 25% 두 단계로 변경'),
      why: pick('A first rollout at 10% is too big to roll back', '첫 롤아웃 10%는 되돌리기에 너무 크다는 판단') },
    jieunDirect: { sectionId: 's6', word: 7,
      paras: pick(['Build weeks 3–4 of Nov · 5% rollout week 1 of Dec · 25% rollout + metrics review week 2 of Dec', 'Design locked week 2 of Nov · usability test with 5 teams week 3 of Nov'],
                  ['11월 3~4주 구현 · 12월 1주 5% 롤아웃 · 12월 2주 25% 롤아웃 + 지표 검토', '11월 2주 설계 확정 · 11월 3주 5개 팀 사용성 테스트']),
      summary: pick('Split the timeline into two lines and added a usability test week', '일정을 두 줄로 나누고 사용성 테스트 주를 추가'),
    },
  };

  /* Home: work units in the workspace. Each carries a preview of its real first page. */
  const EXTRA_MEMBERS = {
    soyeon: { id: 'soyeon', name: pick('Soyeon', '소연'), initial: 'S', color: '#8B5CF6' },
    taeho:  { id: 'taeho',  name: pick('Taeho', '태호'),  initial: 'T', color: '#0EA5A4' },
  };
  const LIBRARY = [
    { id: 'onboarding', live: true, title: DOC.title, members: ['me', 'minsu', 'jieun', 'hyunwoo'], editedMin: 3, accent: '#2F6BFF' },
    { id: 'pricing', title: pick('Pricing page rewrite', '가격 페이지 개편'), members: ['me', 'jieun', 'hyunwoo'], editedMin: 70, accent: '#7C5CFF',
      preview: { lede: pick('Three plans are too many for a first visit. We cut to two and move usage limits below the fold.', '첫 방문에 요금제 세 개는 많다. 두 개로 줄이고 사용량 제한은 아래로 내린다.'),
        sections: [[pick('Background', '배경'), pick('Pricing page bounce is 63%, twice the site average. Session recordings show visitors scanning all three plans and leaving.', '가격 페이지 이탈률은 63%로 사이트 평균의 두 배다. 녹화를 보면 세 요금제를 훑다가 나간다.')],
                   [pick('Goals', '목표'), pick('Raise trial starts from the pricing page from 4.1% to 6%.', '가격 페이지에서 체험 시작률을 4.1%에서 6%로 올린다.')]] } },
    { id: 'roadmap', title: pick('Q1 roadmap', '1분기 로드맵'), members: ['me', 'minsu', 'jieun', 'hyunwoo', 'soyeon', 'taeho'], editedMin: 60 * 26, accent: '#16A26A',
      preview: { lede: pick('One theme per month: activation in January, collaboration in February, reliability in March.', '달마다 주제 하나. 1월 활성화, 2월 협업, 3월 안정성.'),
        sections: [[pick('January', '1월'), pick('Onboarding redesign ships to 25%. Invite acceptance becomes a tracked metric.', '온보딩 개편을 25%까지 배포한다. 초대 수락률을 추적 지표로 올린다.')],
                   [pick('February', '2월'), pick('Shared agent sessions and discussion-driven edits move out of beta.', '공유 에이전트 세션과 토론 기반 수정이 베타를 벗어난다.')]] } },
    { id: 'mobile', title: pick('Mobile app v2 spec', '모바일 앱 v2 기획'), members: ['minsu', 'jieun'], editedMin: 60 * 50, accent: '#D4860A',
      preview: { lede: pick('The mobile app becomes a reading and approval surface, not a second editor.', '모바일 앱은 두 번째 편집기가 아니라 읽고 승인하는 화면이 된다.'),
        sections: [[pick('Scope', '범위'), pick('Document view, discussion votes, and notifications. Editing stays on desktop.', '문서 보기, 토론 투표, 알림. 편집은 데스크톱에 남긴다.')],
                   [pick('Open questions', '열린 질문'), pick('Should direct edits be allowed for single paragraphs?', '문단 하나짜리 직접 수정은 허용할까?')]] } },
    { id: 'hiring', title: pick('Hiring plan 2027', '2027 채용 계획'), members: ['me', 'hyunwoo'], editedMin: 60 * 24 * 4, accent: '#D9503B',
      preview: { lede: pick('Four hires in the first half: two engineers, one designer, one data analyst.', '상반기 4명. 엔지니어 둘, 디자이너 하나, 데이터 분석가 하나.'),
        sections: [[pick('Why now', '왜 지금'), pick('Discussion volume per document doubled since September; the team cannot keep up with review.', '9월 이후 문서당 토론량이 두 배가 됐고 리뷰가 따라가지 못한다.')],
                   [pick('Sequence', '순서'), pick('Engineering first, then design, then data once dashboards stabilize.', '엔지니어링 먼저, 그다음 디자인, 대시보드가 안정되면 데이터.')]] } },
  ];

  return { lang, MEMBERS, EXTRA_MEMBERS, DOC, DOC_EN, SESSIONS, CHANGES, INVITE, DISCUSSION_TEMPLATE, SIM, LIBRARY };
})();
