/* Deterministic stand-in for Claude in MOCK mode: enough to walk the whole judge flow without an API key. */
const AUTO = 'Team invite: with contacts permission (Google · Slack), auto-invite members on the same domain. The permission screen can be skipped.';
const MANUAL = 'Team invite: invite teammates directly by email or invite link.';
const HYBRID = 'Team invite: direct invite by email or link by default. If contacts permission is granted, same-domain members appear as suggestions that can be invited in one go.';
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
    return { note: K ? '지은님이 방금 초대 단계 이탈 41% 때문에 자동 초대로 바꿨어요.' : 'Jieun just changed this to auto-invite because 41% drop off at the invite step.',
      discussion: { title: K ? '팀원 초대, 자동으로 할까 직접 하게 할까' : 'Team invite: automatic or manual?', titleEn: 'Team invite: automatic or manual?',
        question: K ? '이탈을 줄이려는 자동 초대와 권한 부담을 줄이려는 수동 초대가 부딪혀요. 어느 쪽으로 갈까요?' : 'Auto-invite cuts drop-off; manual invite avoids a heavy permission screen. Which way do we go?',
        options: [
          { label: K ? '자동 초대 유지' : 'Keep auto-invite', labelEn: 'Keep auto-invite', desc: K ? '연락처 권한 → 같은 도메인 자동 초대' : 'Contacts permission → auto-invite same domain', text: AUTO },
          { label: K ? '수동 초대로 전환' : 'Switch to manual', labelEn: 'Switch to manual', desc: K ? '이메일·링크로 직접 초대' : 'Invite directly by email · link', text: MANUAL },
          { label: K ? '수동 기본 + 멤버 제안' : 'Manual + suggestions', labelEn: 'Manual + suggestions', desc: K ? '권한 허용 시 같은 도메인 멤버 제안' : 'Suggest same-domain members only if permitted', text: HYBRID },
        ] } };
  }
  const last = messages[messages.length - 1].content;
  const s3 = sectionParas(system, 's3');
  const edit = (para, reply, summary, why) => ({ reply, action: 'edit', sectionId: 's3', paras: [s3[0], para, s3[2]], summary, why, conflict: null, discussion: null });
  if (/auto-invite|Remove typing/i.test(last)) return edit(AUTO, K ? '3. 핵심 기능의 팀원 초대를 연락처 기반 자동 초대로 바꿨어요.' : 'Switched team invite in 3. Core features to contacts-based auto-invite.', K ? '팀원 초대를 자동 초대로 변경' : 'Team invite → contacts auto-invite', K ? '초대 단계 이탈 41%' : '41% drop off at the invite step');
  if (/manual|수동/i.test(last)) return edit(MANUAL, K ? '3. 핵심 기능의 팀원 초대를 수동 초대로 바꿨어요.' : 'Switched team invite in 3. Core features to manual invites.', K ? '팀원 초대를 수동 초대로 변경' : 'Team invite → manual invite', K ? '권한 화면이 부담스럽다' : 'The permission screen feels heavy');
  if (/changed|바뀌|요약/i.test(last)) return { reply: K ? '최근 30분: 민수님이 2번 목표를 수치로 바꿨고, 지은님이 5번에 초대 수락률을 넣었어요.' : 'Last 30 minutes: Minsu made the goals in 2 measurable, and Jieun added invite acceptance rate to 5.', action: 'none', sectionId: null, paras: null, summary: null, why: null, conflict: null, discussion: null };
  return { reply: K ? '(모의 모드) 어느 섹션을 어떻게 바꿀까요?' : '(mock mode) Which section should change, and how?', action: 'clarify', sectionId: null, paras: null, summary: null, why: null, conflict: null, discussion: null };
}
