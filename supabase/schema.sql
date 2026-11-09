-- Relay MVP schema. Run once in the Supabase SQL editor.
-- Browser (anon key): read everything, insert own user messages, insert/update own votes.
-- Functions (service role key): everything else.

create table if not exists rooms (
  id          text primary key,
  title       text not null,
  agent       jsonb not null default '{"state":"idle"}',   -- {state, by_id, by_name, section_id, since, token}
  calls       int  not null default 0,
  bots_on     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists sections (
  room_id         text not null references rooms(id) on delete cascade,
  id              text not null,               -- s1 … s8
  num             int  not null,
  title           text not null,
  paras           jsonb not null default '[]',
  footnote        text,
  steps           boolean not null default false,
  page            int not null default 1,
  rev             int not null default 0,
  last_change_id  text,
  primary key (room_id, id)
);

create table if not exists changes (
  id             text primary key,
  room_id        text not null references rooms(id) on delete cascade,
  section_id     text not null,
  kind           text not null,                -- agent | discussion
  by_id          text not null,
  by_name        text not null,
  summary        text,
  why            text,
  prev           jsonb not null default '[]',
  next           jsonb not null default '[]',
  discussion_id  text,
  message_id     uuid,                          -- the agent reply that carried this change
  created_at     timestamptz not null default now()
);
create index if not exists changes_room on changes (room_id, created_at);

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references rooms(id) on delete cascade,
  user_id     text not null,                    -- whose session this message belongs to
  user_name   text not null,
  role        text not null check (role in ('user', 'agent')),
  text        text not null,
  meta        jsonb not null default '{}',      -- user: {avatar}; agent: {action, applied, change_id, conflict}
  created_at  timestamptz not null default now()
);
create index if not exists messages_room on messages (room_id, created_at);

create table if not exists discussions (
  id               text primary key,
  room_id          text not null references rooms(id) on delete cascade,
  n                int  not null,
  section_id       text,
  para_index       int,
  change_ids       jsonb not null default '[]',
  title            text not null,
  title_en         text,
  question         text,
  options          jsonb not null default '[]',  -- [{id, label, label_en, desc, text}]
  status           text not null default 'open' check (status in ('open', 'resolved')),
  result           text,
  applied          jsonb,                         -- {before, after, change_id, log_change_id, at}
  opened_by_id     text,
  opened_by_name   text,
  resolved_by_id   text,
  resolved_by_name text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists votes (
  discussion_id  text not null references discussions(id) on delete cascade,
  room_id        text not null references rooms(id) on delete cascade,
  user_id        text not null,
  user_name      text not null,
  option_id      text not null,
  comment        text,
  created_at     timestamptz not null default now(),
  primary key (discussion_id, user_id)
);

-- ---------- agent lock: one request at a time per room ----------
-- Returns the room's call count after this call, or -1 when someone else holds the lock (stale after 60 s).
create or replace function acquire_agent(p_room text, p_by_id text, p_by_name text, p_token text)
returns int language plpgsql security definer as $$
declare n int;
begin
  update rooms
     set agent = jsonb_build_object('state', 'working', 'by_id', p_by_id, 'by_name', p_by_name,
                                    'section_id', null, 'since', now(), 'token', p_token),
         calls = calls + 1
   where id = p_room
     and (agent->>'state' is distinct from 'working'
          or (agent->>'since')::timestamptz < now() - interval '60 seconds')
  returning calls into n;
  return coalesce(n, -1);
end $$;

create or replace function release_agent(p_room text, p_token text)
returns void language sql security definer as $$
  update rooms set agent = jsonb_build_object('state', 'idle', 'since', now())
   where id = p_room and agent->>'token' = p_token;
$$;

-- ---------- row level security ----------
alter table rooms       enable row level security;
alter table sections    enable row level security;
alter table changes     enable row level security;
alter table messages    enable row level security;
alter table discussions enable row level security;
alter table votes       enable row level security;

drop policy if exists read_all on rooms;       create policy read_all on rooms       for select using (true);
drop policy if exists read_all on sections;    create policy read_all on sections    for select using (true);
drop policy if exists read_all on changes;     create policy read_all on changes     for select using (true);
drop policy if exists read_all on messages;    create policy read_all on messages    for select using (true);
drop policy if exists read_all on discussions; create policy read_all on discussions for select using (true);
drop policy if exists read_all on votes;       create policy read_all on votes       for select using (true);

drop policy if exists say on messages;
create policy say on messages for insert to anon, authenticated
  with check (role = 'user' and char_length(text) between 1 and 500 and user_id not like 'bot_%');

drop policy if exists vote_in on votes;
create policy vote_in on votes for insert to anon, authenticated
  with check (user_id not like 'bot_%' and exists (select 1 from discussions d where d.id = discussion_id and d.status = 'open'));
drop policy if exists vote_up on votes;
create policy vote_up on votes for update to anon, authenticated
  using (user_id not like 'bot_%')
  with check (exists (select 1 from discussions d where d.id = discussion_id and d.status = 'open'));

revoke execute on function acquire_agent(text, text, text, text) from anon, authenticated, public;
revoke execute on function release_agent(text, text) from anon, authenticated, public;

-- ---------- realtime ----------
alter table rooms       replica identity full;
alter table sections    replica identity full;
alter table discussions replica identity full;
alter table votes       replica identity full;
do $$
declare t text;
begin
  foreach t in array array['rooms', 'sections', 'changes', 'messages', 'discussions', 'votes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
