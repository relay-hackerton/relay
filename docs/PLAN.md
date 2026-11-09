# Relay 해커톤 MVP 구현 계획 (5시간)

Nov 9, 2026 · @김유래

## 확정 프로토타입 요약

확정본 [Relay team agent](https://claude.ai/artifact/7Jizmxoj8dQ7SxV5cviTqs)의 화면과 흐름은 그대로 쓰고, 가짜인 부분을 진짜 서버·데이터베이스·Claude로 바꿔 **심사위원이 공개 링크 하나로 혼자 들어와 체험할 수 있는 MVP**를 5시간 안에 배포한다.

**한 줄 컨셉:** 에이전트 하나를 여러 사람이 각자 대화로 쓰고, 결과는 한 문서에 모이며, 누가 왜 바꿨는지 다 남는다.

**화면 구성:** 왼쪽은 공유 문서(문서 · 토론 · 활동 로그 탭), 오른쪽은 내 세션(같은 에이전트와의 내 대화)이다. 위쪽에 팀원 접속 상태와 에이전트 상태 칩이 있다.

**핵심 장면**

1. **실시간 반영:** 팀원이 자기 세션에서 요청하면 내 화면의 문서가 그 자리에서 바뀐다. 이름표를 누르면 요약, 이유, 이전 내용, 그 사람의 대화가 보인다.
2. **충돌 감지:** 다른 사람이 방금 바꾼 곳을 반대로 바꾸면, 에이전트가 반영한 뒤 "의견이 갈려요"라며 토론을 제안한다.
3. **토론 결론 반영:** 선택지에 투표하고 결론이 나면, 에이전트가 본문과 결정 기록(8번 섹션)을 함께 고친다.
4. **부가 장치:** 에이전트 상태(대기/작업 중), 팀원 커서와 이름표, 세션 공개/비공개, 직접 고치기, 활동 로그 diff.

**지금 가짜인 부분:** 문서는 `data.js`에 고정돼 있고, 에이전트 응답은 키워드 매칭(`handleInput`), 팀원 움직임은 타이머(`simulateTeam`), 투표는 정해진 시각에 들어온다(`simulatedVotes`).

## 범위

심사위원 한 명이 링크를 열고 3분 안에 "여러 사람이 에이전트 하나를 함께 쓴다"를 직접 느끼는 데 필요한 것만 만든다. 로그인과 부가 기능은 버린다. 기본 언어는 영어이고 한국어는 전환으로 제공한다.

| 구분 | 항목 | 비고 |
| --- | --- | --- |
| 진짜로 | 공개 링크와 심사위원 방 | 이름만 입력하고 바로 시작. "Start a room"은 시드 문서가 담긴 새 방을 만들어 심사위원끼리 섞이지 않는다 |
| 진짜로 | 영어 우선, 한국어 전환 | 기본 EN, 상단 토글. 확정본의 i18n.js와 `DOC_EN`을 그대로 쓴다 |
| 진짜로 | 문서 실시간 동기화 | 같은 방에 들어온 사람끼리 바로 맞춰진다 |
| 진짜로 | 에이전트 반영 | 내 세션 요청 → Claude가 섹션을 골라 고침 → 모두의 화면에서 바뀜 |
| 진짜로 | 변경 기록과 활동 로그 | 누가, 왜, 이전 내용, 어느 대화에서 바뀜는지 + diff |
| 진짜로 | 에이전트 상태와 대기 | 요청은 한 번에 하나, 다른 사람 요청은 "Queued" |
| 진짜로 | 충돌 → 토론 → 결론 | 충돌 감지, 선택지 3개 토론, 투표, 결론 반영 |
| 진짜로 | 혼자서도 느끼는 멀티플레이 | "Bring in a teammate"를 누르면 Jieun 봇이 진짜 에이전트에 요청해 문서를 바꾼다. 토론에서는 봇 둘이 먼저 투표해 심사위원이 결정표를 던진다. 초대 링크 복사로 진짜 사람도 부른다 |
| 진짜로 | 접속 표시 | 누가 어느 섹션을 보는지 섹션 이름표 |
| 진짜로 | 남용 방지 | 방마다 에이전트 호출 30회, 메시지 500자 제한 |
| 단순화 | 세션 공유 | 다른 사람 대화 읽기 전용 보기만. 비공개 전환은 버림 |
| 단순화 | 커서 | 단어 위치 대신 섹션 이름표 |
| 단순화 | 공유 문서 본문 언어 | 본문은 영어 하나, 화면 문구와 에이전트 답만 언어를 따른다 |
| 버림 | 로그인, 홈 라이브러리, 새 이슈 만들기 |  |
| 진짜로 | 섹션 단위 직접 수정 | 11/9 추가 결정. 한 섹션을 한 사람이 고치고 저장(rev 확인). 고치는 동안 다른 사람에게 연필 이름표, 활동 로그에 사람 수정 diff. 글자 단위 공동 편집(CRDT)은 하지 않는다 |
| 버림 | 좋아요, 페이지 확대·넘기기 | 시간이 남아도 추가하지 않는다 |
| 시간 남으면 | 여러 확장자로 내보내기 | MVP 이후 후보. 2:30 점검까지 충돌 흐름이 끝나 있으면 C가 시작하고, 3:15 동결 때 안 끝났으면 뺀다. 설계는 부록 참고 |

## 기술 선택

심사위원이 링크로 직접 체험해야 하므로 **Vercel + Supabase + Anthropic API**로 간다. 확정본 화면은 빌드 도구 없이 그대로 올리고, 서버는 Vercel 함수 네 개만 둔다.

| 부분 | 선택 | 이유 |
| --- | --- | --- |
| 화면 | 확정본 HTML·CSS·JS 그대로, 빌드 도구 없음 | 옮기는 시간이 없다 |
| 배포 | Vercel, GitHub 연결로 푸시하면 자동 배포 | 정적 파일과 함수가 한 프로젝트, 브랜치마다 미리보기 주소 |
| 데이터·실시간 | Supabase: Postgres 테이블 + Realtime(변경 구독, presence) | 저장·구독·접속 표시를 한 서비스로, 브라우저에서 CDN으로 바로 쓴다 |
| 에이전트 | Vercel 함수 → Anthropic Messages API, tool use로 JSON 고정 | API 키를 브라우저에 두지 않고, 잠금·쓰기를 서버에서 한 번에 처리 |
| 사람 구분 | 로그인 없음. 이름과 아바타를 고르면 브라우저에 저장 | 심사위원 진입 장벽이 없다 |
| 모델 | `claude-sonnet-5-5`, 느리면 `claude-haiku-5-5` 시험 | 반영 품질과 응답 시간의 균형 |

**쓰기 권한:** 브라우저는 Supabase 공개 키(anon)로 읽기와 사람 메시지·투표 추가만 한다. 섹션·변경·토론·에이전트 상태는 함수가 서비스 키로만 쓴다. 누구나 열 수 있는 링크여도 문서를 마음대로 바꿀 수 없게 하는 최소한의 장치다.

**아티팩트 런타임을 쓰지 않는 이유:** 같은 조직 안에서만 열려 심사위원이 직접 체험할 수 없다.

## 데이터 모델 (Supabase)

테이블 여섯 개와 presence 채널 하나면 확정본의 모든 화면을 채울 수 있다. 활동 로그는 따로 저장하지 않고 변경·토론·메시지를 시간순으로 합쳐 보여준다.

| 테이블 | 주요 칼럼 | 누가 쓰나 |
| --- | --- | --- |
| `rooms` | id(짧은 문자열), title, agent(jsonb: state, by\_name, section\_id, since), calls, bots\_on, created\_at | 함수 |
| `sections` | room\_id, id(s1…s8), num, title, paras(jsonb), rev, last\_change\_id | 함수 |
| `changes` | id, room\_id, section\_id, kind(agent·discussion), by\_id, by\_name, summary, why, prev(jsonb), next(jsonb), discussion\_id, created\_at | 함수 |
| `messages` | id, room\_id, user\_id, user\_name, role(user·agent), text, meta(jsonb: applied, conflict, change\_id), created\_at | 사람 말은 브라우저, 에이전트 말은 함수 |
| `discussions` | id, room\_id, section\_id, change\_ids, title, question, options(jsonb), status(open·resolved), result, created\_at | 함수 |
| `votes` | discussion\_id, user\_id, user\_name, option\_id (기본키: discussion\_id + user\_id) | 브라우저, 봇 표는 함수 |
| presence 채널 `room:{id}` | userId, name, avatar, sectionId, typing | 브라우저 |

다섯 테이블(`sections`, `changes`, `messages`, `discussions`, `votes`)은 Supabase에서 Realtime을 켜고, 브라우저는 `room_id`로 걸러 구독한다.

**에이전트 순서:** 함수가 `rooms.agent`를 조건부 UPDATE로 잡는다(idle이거나 60초 넘게 멈춘 경우만). 못 잡으면 `{queued: true}`를 돌려주고, 브라우저는 2초마다 다시 시도하며 "Queued"를 보여준다. 확정본의 대기 이미지(`agent-waiting.png`)가 여기에 쓰인다.

**덮어쓰기 방지:** 섹션 UPDATE에 `where rev = 읽은 값`을 건다. 0행이 바뀌면 최신 문단으로 한 번 더 만든다.

**방 만들기:** `/api/room` 함수가 시드 JSON(확정본의 `DOC_EN`, Minsu·Jieun의 이전 변경 2개와 대화)을 새 방에 복사하고 방 id를 돌려준다. 주소는 `/r/{id}`이다.

## 에이전트 서버 설계

요청 하나에 Claude 호출은 한 번이다. 반영, 충돌 판단, 토론 초안을 한 번에 받아 응답 시간을 줄이고, 결론 반영에는 Claude를 부르지 않는다.

| 함수 | 받는 것 → 하는 일 |
| --- | --- |
| `POST /api/room` | 없음 → 새 방을 만들고 시드를 복사해 `{roomId}` |
| `POST /api/agent` | `{roomId, userId, userName, text, lang}` → 잠금 → Claude → 검증 → 섹션·변경·에이전트 말(·토론) 쓰기 → 잠금 해제 → `{ok}` 또는 `{queued}` |
| `POST /api/resolve` | `{roomId, discussionId}` → 최다 득표 선택지를 본문과 Decision log에 반영 |
| `POST /api/bot` | `{roomId, lang}` → Jieun 봇 이름과 정해진 문장으로 `/api/agent`와 같은 처리를 돌린다 |

**`/api/agent` 순서**

1. 방 호출 수를 확인한다. 30회를 넘으면 에이전트가 정중히 거절하는 말만 남긴다.
2. `rooms.agent`를 잡는다. 못 잡으면 `{queued: true}`.
3. 섹션 전체, 최근 30분 변경, 이 사람의 최근 대화 8개를 읽는다.
4. Claude를 부른다. tool use로 아래 JSON 모양을 강제한다.
5. 검증한다: 섹션 id가 있는지, 문단 수가 3개 넘게 늘지 않았는지, `paras`에 한글이 없는지. 틀리면 한 번 재시도한다.
6. 섹션(rev 확인), 변경, 에이전트 말을 쓰고, 충돌이면 토론도 쓴다. 봇이 켜진 방이면 봇 둘의 표를 양쪽에 하나씩 넣는다.
7. 성공하든 실패하든 `finally`에서 잠금을 푼다.

```json
{"reply": "I'll switch the team invite in 3. Core features to manual invites.",
 "action": "edit", "sectionId": "s3",
 "paras": ["…", "Team invite: invite teammates directly by email or invite link.", "…"],
 "summary": "Team invite → manual", "why": "The permission screen felt like a burden",
 "conflict": {"changeId": "c_jieun_s3", "note": "Jieun changed this to auto-invite at 21:23 because 41% drop at the invite step."},
 "discussion": {"title": "Team invite: automatic or manual?", "question": "…",
   "options": [{"label": "Keep auto-invite", "desc": "…", "text": "…"},
               {"label": "Switch to manual", "desc": "…", "text": "…"},
               {"label": "Manual by default + suggested members", "desc": "…", "text": "…"}]}}
```

**`action` 값:** `edit`는 반영, `clarify`는 되묻기, `none`은 답만 하기. 충돌이 없으면 `conflict`와 `discussion`은 `null`이다.

**충돌 판단:** Claude가 `conflict`를 채우면 그대로 쓴다. 비어 있어도 "같은 섹션을 30분 안에 다른 사람이 바꿨고, 이번에 그 문단을 다시 바꾸며, 열린 토론이 없다"면 충돌로 보고, 토론 초안만 한 번 더 받는다.

**언어 규칙:** 프롬프트는 영어다. 본문 `paras`와 토론 선택지의 `text`는 항상 영어다. `reply`·`summary`·`why`와 토론의 나머지 글은 요청한 사람의 `lang`(기본 `en`)을 따른다.

**팀원 봇:** "Bring in a teammate"는 /api/bot을 부르고, 이 함수가 같은 `/api/agent`를 Jieun 이름과 정해진 문장("Remove typing from the invite step.")으로 부른다. 봇도 진짜 에이전트를 거치므로 심사위원이 보는 반영은 모두 실제다.

**시간 제한:** Vercel 함수의 최대 실행 시간을 60초로 두고, Claude 호출에는 40초 타임아웃을 건다.

## 5시간 타임라인

세 명이 세 갈래로 동시에 진행한다. 처음 30분 안에 빈 화면이라도 Vercel에 배포해 두고, 그 뒤로는 푸시할 때마다 실제 링크에서 확인한다. 3:15에 기능 추가를 멈춘다.

&#91;embedded content: 5시간 MVP 계획 · 세 갈래 담당, 점검 두 번\]

- **0:30 점검:** 배포 주소가 열리고, 함수 하나가 Supabase와 Anthropic에 닿는다(키 확인).
- **1:45 점검:** 배포 링크에서 두 브라우저가 같은 방에 들어가, 한쪽이 요청하면 양쪽 문서가 바뀌고 이름표와 diff가 보인다.
- **3:15 점검:** 심사위원처럼 혼자 들어가 방 만들기, 팀원 봇, 내 요청, 충돌, 토론, 투표, 결론까지 끝까지 된다. 이후 기능 추가 없음.
- **4:15부터:** 제출물(README, 데모 영상, 제출 양식)과 발표 리허설.

## 3명이 겹치지 않게 일하는 법

파일을 사람별로 나눠 갖고, 0:30에 화면과 서버 사이의 약속을 고정한 뒤, 각자 가짜 구현으로 먼저 만들고 정해진 시점에만 합친다. 남의 파일은 고치지 않는다.

1. **파일 소유:** 한 파일은 한 사람만 고친다. 고칠 일이 생기면 주인에게 요청한다.
2. **약속 고정:** 화면은 `Store` 함수와 `/api/*` 엔드포인트만 부른다. Supabase나 Anthropic을 직접 부르지 않는다.
3. **배포를 먼저:** 0:30에 빈 화면과 함수 하나를 배포해 두고, 그 뒤 모든 확인은 실제 링크에서 한다.
4. **정해진 때만 합치기:** 1:15, 1:45, 2:30, 3:15에만 합치고, 프로덕션 배포는 A가 맡는다.

&#91;embedded content: MVP 구조와 담당 · 누가 무엇을 부르나\]

화살표는 부르는 방향이다. 함수가 문서를 고치면 브라우저는 따로 알림을 받지 않고 Supabase 구독으로 바뀜을 받는다.

### 기능별 담당

한 기능을 세 조각(저장, 판단, 표시)으로 나눠, 같은 조각을 두 사람이 만들지 않게 한다.

| 기능 | A 데이터·배포 (store.js, SQL, /api/room) | B 에이전트 (/api/agent, /api/resolve) | C 화면·제출 (app.js · panels.js · i18n.js) |
| --- | --- | --- | --- |
| 영어 우선 다국어 | 시드는 `DOC_EN` | 영어 프롬프트, 답은 `lang`에 맞추기 | 새 문구는 i18n.js에 EN 먼저, 토글 |
| 방과 입장 | 방 만들기·시드 복사, `/r/{id}` 라우팅 |  | 랜딩, 이름·아바타 고르기, 초대 링크 복사 |
| 문서 동기화 | 테이블 구독, 변경 이벤트 내보내기 |  | 문서 렌더, 타이핑 애니메이션 |
| 에이전트 반영 |  | 잠금, 프롬프트, 검증, 쓰기 | 내 채팅, 반영 결과 말풍선, 이름표 팝업 |
| 에이전트 상태·대기 | `rooms.agent` 구독 | 잠금 잡기·풀기, `{queued}` 응답 | 상태 칩, 2초 재시도 |
| 다른 사람 대화 보기 | 메시지 구독 | 최근 대화 8개를 프롬프트에 | 읽기 전용 보기 |
| 충돌 → 토론 | 토론·투표 구독, 투표 넣기 | 충돌 판단, 토론 초안, 봇 표, 결론 반영 | 충돌 카드, 토론 탭, 투표·결론 버튼 |
| 팀원 봇 | `rooms.bots_on` | 봇 요청을 같은 파이프라인으로 | "Bring in a teammate" 버튼, 봇 아바타 |
| 접속 표시 | presence 채널 |  | 섹션 이름표, 상단 접속자 |
| 활동 로그 | 변경·토론·메시지를 시간순으로 돌려주기 |  | 로그 탭, diff(diff.js 그대로) |
| 제출 | 환경 변수, 도메인, 호출 제한 | 비용·응답 시간 점검 | README, 데모 영상, 영어 발표 자료 |

### 0:30에 고정할 약속

세 사람이 서로 기다리지 않는 열쇠는 이 약속이다. 처음 30분에 셋이 같이 확정하고, 바꿀 때는 채팅에 알리고 이 문서를 먼저 고친다. 테이블 칼럼은 위 데이터 모델이 기준이다.

```js
// store.js — A가 만든다. C가 부른다. (브라우저, Supabase anon 키)
Store.join(roomId, { userId, name, avatar })   // 구독·presence 시작, 처음 데이터 한 번에 돌려줌
Store.on(kind, cb)       // kind: sections | changes | messages | discussions | votes | room | presence
Store.say(text)          // 내 말을 messages에 넣고, /api/agent 호출까지 (queued면 2초마다 재시도)
Store.vote(discussionId, optionId)
Store.setPresence({ sectionId, typing })
Store.createRoom()       // /api/room → roomId

// 함수 — B가 만든다(room은 A). Store가 부른다.
POST /api/agent   { roomId, userId, userName, text, lang }   → { ok: true } | { queued: true } | { error }
POST /api/resolve { roomId, discussionId }                   → { ok: true }
POST /api/room    { }                                         → { roomId }
POST /api/bot     { roomId, lang }                            → { ok: true }   // Jieun 봇 요청
```

**반환값과 이벤트 이름은 바꾸지 않는다.** 필드를 더하는 것은 괜찮지만, 이름을 바꾸거나 빼는 일은 세 사람이 모였을 때만 한다.

### 서로 기다리지 않고 시작하는 법

0:30부터 1:15까지는 셋 다 가짜 구현 위에서 일한다. 진짜끼리 처음 붙여 보는 건 1:15이다.

- **A:** Supabase SQL을 먼저 실행하고(테이블, Realtime, 읽기 전용 정책), 시드를 넣은 방 하나를 손으로 만들어 B와 C에게 방 id를 준다. store.js는 그 방을 구독하는 것부터 만든다.
- **B:** 화면 없이 시작한다. `curl`로 `/api/agent`를 부르고, A가 준 방의 섹션이 Supabase 대시보드에서 바뀌는지 본다. 요청 문장 10개(영어 7·한국어 3)로 프롬프트를 돌린다.
- **C:** 확정본의 메모리 상태를 `Store` 모양으로 감싼 가짜 store부터 만든다. `Store.say`는 기존 키워드 응답을 감싼 가짜로 둔다. A의 store.js가 오면 파일만 바꿔 끼운다.
- **로컬 실행:** `vercel dev`로 화면과 함수를 함께 띄운다. 환경 변수는 `vercel env pull`로 받는다. Supabase 프로젝트는 셋이 같은 것을 쓴다.

### 저장소와 합치는 규칙

- **저장소 하나, 파일 소유 그대로:** GitHub 저장소에 확정본 파일과 `store.js`, `api/`, `supabase/schema.sql`을 둔다. A는 `store.js`·`api/room.js`·`schema.sql`·`vercel.json`·`index.html`, B는 `api/agent.js`·`api/resolve.js`·`api/bot.js`·`api/_prompt.js`, C는 `app.js`·`panels.js`·`styles.css`·`i18n.js`·랜딩을 맡는다. `diff.js`는 손대지 않는다.
- **브랜치는 사람당 하나:** 각자 자기 브랜치에 푸시하면 Vercel이 미리보기 주소를 만들어 준다. 고치는 파일이 겹치지 않아 합칠 때 충돌이 거의 없다.
- **합치는 시점 네 번:** 1:15(가짜를 진짜로 바꿔 끼우기), 1:45(점검), 2:30(충돌 흐름 1차), 3:15(기능 동결). A가 main에 합치면 프로덕션 주소가 바뀜다. 셋이 그 주소에서 함께 시험한다.
- **제출 주소는 3:15 이후 고정:** 동결 뒤에는 버그 수정만 main에 올리고, 올릴 때마다 심사위원 흐름을 한 번 돌려 본다.
- **15분 규칙:** 15분 넘게 막히면 바로 공유하고, 그 부분은 가짜로 남겨 둔 채 다음으로 넘어간다.

### 각자 Claude로 코드를 만들 때

- 세 사람이 각자 Claude 세션 하나씩 쓴다. 첫 메시지에 위의 함수 약속과 자기 파일 목록만 붙이고 "이 파일만 고친다"고 지시한다.
- 다른 사람 파일이 필요해 보이면 함수 약속만 근거로 삼는다. 그 파일을 고쳐 달라고 하지 않는다.
- Claude가 약속에 없는 함수를 만들어 쓰려 하면 멈추고, 필요하면 팀에 약속 변경을 요청한다.

## 심사위원 체험 흐름과 발표 대본

심사위원은 혼자 링크를 연다. 그래서 제품 안에 3분짜리 체험 흐름을 그대로 심어 둔다. 화면과 대사는 모두 영어다.

**혼자 들어온 심사위원의 3분 (제품 안 안내 카드가 순서대로 이끜다)**

1. **Start:** 링크 → 이름·아바타 고르기 → "Start a room". 시드 문서와 Minsu·Jieun의 이전 변경 2개가 담긴 방이 열린다.
2. **Watch:** "Bring in a teammate" → Jieun이 접속자로 나타나 요청을 보내고, 에이전트 칩이 "Jieun's request · 3. Core features"로 바뀜다. 문서가 그 자리에서 바뀌고, 이름표를 누르면 이유와 Jieun의 대화가 보인다.
3. **Redirect:** 안내 카드가 추천 문장("Switch the team invite in section 3 to manual invites.")을 보여준다. 보내면 반영되고 "Opinions differ"가 뜨며, 토론을 열면 Minsu와 Jieun이 이미 다른 쪽에 투표해 있다. 심사위원의 표가 결정표다.
4. **Decide:** "Resolve" → 에이전트가 3번과 Decision log를 함께 고친다. Activity 탭에서 전 과정의 diff를 본다.
5. **Invite:** "Copy invite link"로 다른 사람을 불러 진짜 멀티플레이도 해 볼 수 있다.

**90초 발표 (실제 팀원 세 명이 각자 노트북으로)**

1. **Watch (25초):** Jieun 역할이 "Remove typing from the invite step."을 보낸다. 발표자 화면에서 문서가 바뀌고, 이름표로 이유를 보여준다.
2. **Redirect (35초):** 발표자가 "Switch the team invite in section 3 to manual invites."를 보낸다. "Opinions differ" → 토론 → 두 팀원이 각자 투표.
3. **Decide and record (20초):** 결론 → 3번과 Decision log 반영 → Activity diff.
4. **마무리 (10초):** "One agent, used by the whole team. Every change shows who made it and why. Try it yourself at relay…" (제출 링크를 화면에 띄운다)

## 위험과 대응

가장 큰 위험은 배포 환경 설정에서 시간을 잃는 것과, 심사 중 에이전트가 느리거나 멈추는 것이다. 처음 30분에 배포를 끝내고, 멈춰도 잠금이 풀리게 만든다.

| 위험 | 대응 |
| --- | --- |
| 환경 설정에 시간 소모(키, CORS, Realtime 미활성) | 0:30 점검에서 함수 하나가 Supabase와 Anthropic에 닿는 것까지 확인한다. Realtime은 테이블 다섯 개 모두 켜는지 체크리스트로 본다 |
| 응답이 5\~15초 걸림 | 에이전트 칩과 섹션 하이라이트로 작업 중임을 보여주고, 반영 직후 타이핑 애니메이션을 재생한다. 느리면 하이쿠로 바꿔 본다 |
| 함수가 도중에 죽어 잠금이 남음 | `finally`에서 해제하고, 60초 넘은 잠금은 다음 요청이 빼앗는다 |
| JSON 형식 이탈 | tool use로 모양을 강제하고, 검증 후 한 번 재시도, 실패 시 되묻기 |
| 언어가 섞임 | 본문은 영어로만 쓰라고 못박고, `paras`에 한글이 있으면 재시도한다 |
| 누구나 여는 링크라 비용·남용 | 방마다 호출 30회, 메시지 500자, Anthropic 콘솔에 월 사용 한도 설정 |
| 심사위원끼리 문서가 섞임 | 심사위원마다 "Start a room"으로 새 방. 공용 데모 방은 두지 않는다 |
| 새 문구의 번역 누락 | i18n.js에 키가 없으면 EN을 보여주고, 3:15 이후 KO 빈 키를 한 번에 채운다 |
| 현장 네트워크·시연 실패 | 리허설 녹화본을 제출 영상으로도 쓴다 |
| 3:15까지 충돌 흐름 미완성 | 토론 초안을 미리 만든 고정 선택지로 대체하고 투표·반영만 실제로 동작시킨다 |

## 시작 전 체크리스트

아래가 준비돼 있으면 0:00에 바로 갈래별 작업을 시작할 수 있다. 계정과 키는 해커톤 전날 만들어 두면 30분을 아낀다.

- [ ] 해커톤 규칙 확인: 미리 만든 코드·계정을 써도 되는지, 제출물(링크, 저장소, 영상, 설명)과 마감 시각
- [ ] 계정: GitHub 저장소(셋 다 쓰기 권한), Vercel 팀, Supabase 프로젝트, Anthropic API 키(사용 한도 설정)
- [ ] 환경 변수: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`(함수용), 브라우저용 `SUPABASE_ANON_KEY`
- [ ] 갈래별 담당자 지정(A 데이터·배포, B 에이전트, C 화면·제출)과 발표 역할(발표자, Jieun 역할, Minsu 역할)
- [ ] 확정본 파일 16개를 저장소에 올려 두기
- [ ] 시드 확정: 영어 온보딩 문서 v0.4(`DOC_EN`), Minsu·Jieun의 이전 변경 2개와 대화, 봇 문장
- [ ] 제출 링크용 도메인 또는 Vercel 프로젝트 이름(예: relay-team-agent.vercel.app)
- [ ] 영어 발표 대본·README 담당자 지정(C가 쓰고 발표자가 검토)

## 부록: 구현하며 정한 것 (11/9 10:30 기준)

위 약속에 필드를 더한 것만 있고, 이름을 바꾸거나 뺀 것은 없다. 더 바꿀 일이 생기면 이 부록부터 고친다.

**저장소 구조**

| 경로 | 담당 | 내용 |
| --- | --- | --- |
| `index.html`, `vercel.json`, `package.json`, `supabase/schema.sql`, `store.js`, `api/room.js`, `api/config.js`, `api/_lib.js`, `api/_seed.js` | A | 스키마·정책·잠금 함수, 시드, 방 만들기, 브라우저 설정 |
| `api/agent.js`, `api/resolve.js`, `api/bot.js`, `api/edit.js`, `api/_agent.js`, `api/_resolve.js`, `api/_edit.js`, `api/_prompt.js` | B | 에이전트 파이프라인, 결론 반영, 팀원 봇 |
| `app.js`, `panels.js`, `styles.css`, `i18n.js`, `data.js` | C | 화면, 랜딩, 안내 카드, 문구 |
| `diff.js`, `fonts/`, `img/` | 손대지 않음 | 확정본 그대로 |
| `scripts/check.mjs`, `scripts/mockdb.mjs`, `scripts/fake-claude.mjs` | B | Supabase·Claude 없이 서버 흐름 전체를 도는 테스트 (`npm run check`) |
| `dev-server.mjs`, `scripts/mock-supabase.js` | A | 로컬 서버. `MOCK=1`이면 키 없이 화면까지 전부 돈다 |

`api/` 안에서 `_`로 시작하는 파일은 Vercel이 함수로 만들지 않는 공용 모듈이다.

**데이터 모델에 더한 칼럼**

- `sections`: `footnote`, `steps`, `page` (확정본 렌더링에 필요)
- `changes`: `message_id` (이 변경을 담은 에이전트 답 → "어느 대화에서" 연결)
- `discussions`: `n`(토론 번호), `para_index`(다툰 문단 위치), `title_en`, `applied`, `opened_by_*`, `resolved_*`. 선택지는 `{id, label, label_en, desc, text}`
- `votes`: `room_id`(Realtime 필터용), `comment`(봇이 표와 함께 남기는 한 줄)
- 잠금은 SQL 함수 `acquire_agent` / `release_agent`로 한 번에 처리한다. 잡으면서 호출 수도 1 올린다.

**함수와 Store에 더한 것**

- `GET /api/config`: 브라우저에 Supabase URL과 anon 키를 내려주는 스크립트. 키를 파일에 적지 않으려고 둔다.
- `POST /api/resolve`: `optionId?`(동점일 때 고른 결론), `userId`, `userName`, `lang`을 더 받는다. 동점이면 409 `{error:'tie'}`.
- `Store.resolve(discussionId, optionId, {lang})`, `Store.bot({lang})`, `Store.say(text, {lang, onQueued})`, `Store.configured()`, `Store.me()`, `Store.roomId()`

**시드와 봇**

- 3번 팀원 초대는 원래 문장(이메일 입력·초대 링크)으로 시작한다. Jieun의 이전 변경은 5번(초대 수락률 지표 추가)이다. 봇 Jieun이 3번을 자동 초대로 바꿔야 심사위원의 "수동 초대" 요청과 충돌이 생기기 때문이다.
- 봇 문장: "Remove typing from the invite step. We lose 41% there, so auto-invite same-domain teammates from contacts instead." 반영 방향이 매번 흔들리지 않게 이유와 방향을 덧붙였다.
- 봇 표: 반박당한 변경의 주인(Jieun)은 A(기존 유지), 다른 봇(Minsu)은 B(새 요청). 심사위원 한 표가 결정표다.
- 사람 아이디는 브라우저에서 만든 `u_…`, 봇은 `bot_jieun`·`bot_minsu`, 에이전트는 `agent`.

**모델 제공자 (11/9 변경)**

- Anthropic 크레딧이 없어 OpenAI로 돌린다. `OPENAI_API_KEY`만 넣으면 OpenAI, `ANTHROPIC_API_KEY`가 있으면 Claude, `LLM_PROVIDER`로 강제할 수 있다.
- OpenAI는 Responses API(`/v1/responses`)에 함수 하나를 강제 호출한다(`tool_choice`). GPT-6 계열은 Chat Completions에서 도구 호출이 제한돼서다. 기본 모델 `gpt-6-luna`, `OPENAI_REASONING=low`.
- 프롬프트, 도구 스키마, 검증은 두 제공자가 같이 쓴다.

**확정본 UI 전체 복원 (11/9 12:00 결정)**

- 화면은 확정본과 같은 마크업·스타일로 되돌렸다. 버렸던 홈 라이브러리, 페이지·확대 바, 세션 공개/비공개, 좋아요, 사람이 여는 토론과 댓글, 체험 가이드 모달을 실제 데이터로 살렸다.
- 새 테이블 `reactions`(👍), `comments`(토론 댓글)는 브라우저가 직접 쓴다(봇 아이디는 정책으로 막음). 공개/비공개는 presence로 공유한다.
- `POST /api/discuss`: 사람이 토론을 연다. 채팅에서 토론을 열어 달라고 하면 에이전트가 `action: "discuss"`로 초안을 만들고, 화면이 작성 폼을 채워 연다. 토론 중인 섹션에 대한 요청은 그 토론의 댓글이 된다.
- 결론 선택지에 바로 쓸 문단이 없으면(사람이 연 토론) 결론 반영 때 모델이 그 섹션을 결론대로 고쳐 쓴다.
- MVP용으로 만들었던 이름 입력 페이지, 오른쪽 안내 카드, 상단 버튼은 없앴다. 이름은 확정본 모달 스타일로 묻고, 팀원 봇과 초대 링크는 환영 메시지 안에 둔다.

**입장 방식 (11/9 13시 변경)**

- 처음 들어오면 닉네임만 묻는다(2~20자). `profiles` 테이블에서 대소문자 구분 없이 중복을 막고, 아바타는 서버가 무작위로 정한다. `POST /api/profile`.
- 브라우저는 `relay.me`(userId, 닉네임, 아바타)만 기억하고, 방문할 때마다 서버에 있는 사람인지 다시 확인한다. 서버에 없는 기억(이전 빌드나 다른 테스트의 흔적)은 지우고 다시 묻는다.
- 공개/비공개는 방문마다 공개로 시작한다(저장하지 않음). 체험 가이드 모달은 자동으로 띄우지 않는다.
- 커서·입력 중·초안은 Presence가 아니라 Broadcast로 보낸다(Presence는 클라이언트당 30초에 5번 제한).

**모델 선택 (11/9 추가)**

- `api/_models.js`가 키가 있는 제공자의 모델만 목록으로 만든다. 기본 목록: Claude Sonnet 5.5·Haiku 5.5, GPT-6 Luna·Astra, Codex(GPT-5.3). `OPENAI_MODELS`/`ANTHROPIC_MODELS`/`DEFAULT_MODEL`로 바꾼다.
- `GET /api/models` → `{ models, default }`. 내 세션 머리글의 Model 선택이 요청마다 `model`을 보낸다(브라우저에 기억). 서버는 목록에 없는 값이면 기본 모델을 쓴다.
- 답한 모델은 `messages.meta.model`에 남고, 채팅의 "반영됨" 줄과 이름표 팝업에 보인다. 봇과 결론 반영은 기본 모델을 쓴다(결론 반영은 모델을 부르지 않는다).

**직접 수정 (11/9 추가)**

- `POST /api/edit { roomId, userId, userName, sectionId, paras, rev, lang }` → `{ ok, changeId }`. 시작할 때의 `rev`와 다르면 409 `stale`, 열린 토론이 있는 섹션이면 409 `frozen`. 에이전트 잠금은 쓰지 않고 rev로만 덮어쓰기를 막는다.
- 변경은 `changes.kind = 'human'`으로 남고, 이후 에이전트 요청의 충돌 감지 대상에도 들어간다.
- 고치는 중에는 presence에 `editing: sectionId`를 올려 다른 사람 화면에 "OO님 수정 중"과 연필 이름표를 보여준다.
- `Store.edit(sectionId, paras, rev, {lang})`

**내보내기 (시간 남으면, 11/9 추가)**

MVP가 끝난 뒤 시간이 남으면 넣는다. 서버 없이 브라우저에서 지금 문서 상태로 파일을 만든다.

| 형식 | 만드는 법 | 순서 |
| --- | --- | --- |
| Markdown `.md` | 제목·리드·섹션(`## 3. Core features`)·문단, 마지막에 결정 기록 | 1 |
| HTML `.html` | 스타일을 안에 넣은 단일 파일 | 2 |
| PDF | 인쇄용 CSS + `window.print()` (브라우저의 PDF 저장) | 3 |
| JSON `.json` | 섹션과 변경 기록(누가·왜·이전·이후) 전체 | 4 |
| Word `.docx` | 누를 때만 CDN에서 docx 라이브러리를 불러와 생성 (구현됨) | 5 |

- 파일: `export.js` (C 담당), `window.RelayExport.download(format, { title, lede, sections, changes, discussions })`
- 화면: 문서 탭 오른쪽에 "Export" 메뉴 하나. 새 API나 테이블은 만들지 않는다.

**화면에서 단순화한 것**

- 토론은 충돌 때 에이전트가 연다. 사람이 직접 토론을 만드는 화면과 토론 댓글 입력은 버렸다.
- 결론 확정은 1표 이상이면 가능하다(혼자 들어온 심사위원도 끝까지 갈 수 있게).
- 페이지 확대·넘기기 바, 좋아요, 세션 비공개, 홈 라이브러리는 화면에서 뺐다.

**로컬 실행**

1. Supabase SQL 편집기에서 `supabase/schema.sql`을 실행한다.
2. `.env.example`을 `.env.local`로 복사해 키를 채운다 (`ANTHROPIC_MODEL`은 기본 `claude-sonnet-5-5`).
3. `node dev-server.mjs`(키 사용) 또는 `vercel dev`.
4. 키 없이: `MOCK=1 node dev-server.mjs` → 메모리 DB, 정해진 답을 하는 가짜 Claude, SSE로 흉내 낸 실시간. 브라우저 두 개로 방 만들기 → 팀원 봇 → 충돌 → 토론 → 결론 → 직접 수정까지 전부 돌아간다. 화면 작업(C)은 이걸로 한다.
5. `npm run check`: 서버 흐름 전체를 모의 DB로 검사한다.
