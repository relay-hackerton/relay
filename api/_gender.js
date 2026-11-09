/* Best-effort guess of 'f' / 'm' from a nickname, only to pick a fitting random portrait. null when unsure. */

const KO_SURNAMES = new Set([...'김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진나엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경사부']);
const KO_F_NAMES = new Set(['서연', '서윤', '지민', '하은', '하윤', '지아', '수아', '다은', '예은', '채원', '지윤', '은서', '민서', '수빈', '예린', '유나', '지은', '소연', '혜진', '유진', '민지', '수진', '지현', '은지', '보람', '다솜', '나래', '미진', '현정', '은정', '지혜', '소희', '하늘', '아름', '슬기', '가은', '나연', '채영', '다현', '사나', '지효', '유리', '수정', '세영', '예지', '다인', '윤아', '서현', '수지', '아이유']);
const KO_M_NAMES = new Set(['민준', '서준', '도윤', '예준', '시우', '주원', '하준', '지호', '지후', '준우', '준서', '건우', '현우', '도현', '민수', '준호', '태호', '동현', '성민', '재현', '상우', '영호', '진우', '민재', '승민', '현준', '태윤', '지훈', '정우', '우진', '민혁', '성훈', '재훈', '동욱', '상훈', '준영', '태현', '병철', '영수', '철수', '대현', '승현', '준혁', '형준', '정민']);
/* last syllable of a Korean given name, only the clearly gendered ones */
const KO_F_END = new Set([...'은연희아나린미슬리라란숙순옥애화혜정경']);
const KO_M_END = new Set([...'호훈준철석혁욱범용우기식환규근국섭일태웅재찬건균상운수']);
const KO_UNISEX = new Set(['지우', '서우', '시온', '하람', '한결', '다온', '이안', '로운', '하진', '윤서']);
const KO_F_WORDS = ['여자', '언니', '누나', '여신', '공주', '엄마', '딸'];
const KO_M_WORDS = ['남자', '오빠', '형님', '아빠', '왕자', '아들'];

const EN_F = new Set('alice amelia amy anna anne ashley ava bella chloe claire daisy diana elena eliza ella emily emma eva grace hannah harper isabella ivy jane jennifer jenny jessica jisoo julia kate katie laura lily linda lisa lucy luna mary mia nancy natalie nina olivia rachel rose ruby sara sarah scarlett sofia sophia sophie stella susan victoria yuna zoe jennie rosé rose'.split(' '));
const EN_M = new Set('aaron adam alex andrew anthony ben benjamin brian charles chris daniel david dylan eric ethan evan felix frank george harry henry jack jacob james jason john jonathan joseph josh joshua justin kevin leo liam lucas luke mark matthew max michael nathan noah oliver owen paul peter richard robert ryan sam samuel scott sean simon steve steven thomas tim tom tony william jay jun min jin'.split(' '));
const EN_F_WORDS = ['girl', 'woman', 'lady', 'queen', 'princess', 'mom', 'she', 'miss', 'ms'];
const EN_M_WORDS = ['boy', 'man', 'guy', 'king', 'prince', 'dad', 'he', 'mr', 'bro'];
const EN_M_A = new Set(['luca', 'joshua', 'ezra', 'elijah', 'noah', 'jonah', 'nikita', 'sasha', 'andrea', 'aka']);

export function guessGender(nickname) {
  const raw = String(nickname || '').toLowerCase().normalize('NFC');
  const votes = { f: 0, m: 0 };
  /* Korean: words, then the given name (drop a surname from 3-syllable names) */
  const ko = (raw.match(/[가-힣]+/g) || []);
  for (const w of ko) {
    if (KO_F_WORDS.some((x) => w.includes(x))) votes.f += 2;
    if (KO_M_WORDS.some((x) => w.includes(x))) votes.m += 2;
    const given = w.length === 3 && KO_SURNAMES.has(w[0]) ? w.slice(1) : w.length === 2 || w.length === 1 ? w : null;
    if (!given || KO_UNISEX.has(given)) continue;
    if (KO_F_NAMES.has(given)) votes.f += 3;
    else if (KO_M_NAMES.has(given)) votes.m += 3;
    else if (given.length === 2) {
      const last = given[1];
      if (KO_F_END.has(last)) votes.f += 1;
      if (KO_M_END.has(last)) votes.m += 1;
    }
  }
  /* Latin: known names and words, then the "-a" ending */
  for (const w of raw.match(/[a-z]+/g) || []) {
    if (EN_F.has(w)) votes.f += 3; else if (EN_M.has(w)) votes.m += 3;
    else if (EN_F_WORDS.includes(w)) votes.f += 2; else if (EN_M_WORDS.includes(w)) votes.m += 2;
    else if (w.length >= 4 && w.endsWith('a') && !EN_M_A.has(w)) votes.f += 1;
  }
  if (votes.f === votes.m) return null;
  return votes.f > votes.m ? 'f' : 'm';
}
