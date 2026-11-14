# Deploying the Cosy Corner backend 🏡☁️

**Who this file is for:** whoever operates the shared backend — not the
couples using the app. Our Cosy Corner is now a downloadable app (macOS +
Windows) backed by **one hosted Supabase project shared by every couple who
downloads it**. You (the developer/operator) set this up **once**. After
that, anyone can download the app, sign in with Google, and click
**"Create our corner"** or **"Join with a code"** — they never see this
file, never touch Supabase, and never run any SQL.

Every couple's data lives in the same database, in the same tables, next to
every other couple's data. The only thing keeping one couple from ever
seeing another couple's rows is **Row Level Security (RLS)** — every policy
below is written with that in mind. Read it as "the database itself refuses
to hand back rows you're not a member of," not just "the app is polite
enough not to ask."

It takes about 20–30 minutes. No local Postgres, no CLI required — everything
happens in the Supabase dashboard's SQL Editor and a couple of toggle
switches.

---

## Part 1 — Create the Supabase project

1. Go to **https://supabase.com/dashboard** and sign in (or create a free
   account).
2. Click **New project**. Give it a name (e.g. `our-cosy-corner-prod`), pick
   a region close to most of your expected users, set a database password
   (store it in a password manager — you won't need it day-to-day, since the
   app never uses it directly, but you'll want it if you ever need `psql`),
   and click **Create new project**.
3. Wait a minute or two while it provisions.

---

## Part 2 — Database schema, RLS, and RPCs

Open the **SQL Editor** → **New query**, paste the **entire block below**,
and click **Run**. It's ordered so a single paste runs top-to-bottom with no
forward-reference errors: tables first, then helper functions (which query
the tables), then indexes/triggers (which need the functions to already
exist), then the four RPCs the app calls, then grants, then Row Level
Security policies, then Realtime.

**Safe to re-run.** The block is idempotent: on a fresh project it creates
everything; on a project that already ran an **older version** of this
schema (the symptom is `ERROR: 42P07: relation "spaces" already exists`)
it upgrades in place — tables and their rows are **kept**, while functions,
triggers, indexes, and policies are dropped and recreated at the current
definitions. One consequence: re-running this on an existing project also
drops the Part 3 storage-bucket policy (it depends on `is_space_member`),
so **after any re-run, re-apply the Part 3 policy too**. Operators
upgrading an existing deployment must also re-run this whole Part 2 block
to pick up new RPCs added in a later version of this file (e.g.
`delete_account`) — the app calls them by name, so a project stuck on an
older Part 2 run simply won't have them yet.

```sql
-- ───────────────────────────── 1. TABLES ─────────────────────────────
-- `members` stays a plain uuid[] and `member_profiles` a jsonb map
-- (uid → {name, photo, mood, gender}) rather than a normalized join
-- table — this is a deliberate, small-scale (2 people per space) design
-- that keeps the client's `space.members` / `space.memberProfiles[uid]`
-- access patterns simple. It's also exactly why the RLS design below
-- has to work harder than a typical join-table schema: anyone who can
-- UPDATE a spaces row could, in principle, rewrite the members array
-- directly — see the "membership columns" trigger further down for how
-- that's closed off.

create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Cosy Corner',
  invite_code text not null unique,
  members uuid[] not null default '{}',
  member_profiles jsonb not null default '{}',
  section_names jsonb not null default '{}',
  theme jsonb,
  -- What the corner is for, and how many people it holds. `kind` is one of
  -- 'couple' | 'friends' | 'family'. `capacity` is the max member count the
  -- join_space RPC enforces (couples default to 2; groups pick up to 8).
  -- Existing rows created before this column default to a 2-person couple,
  -- which is exactly what they were, so nothing changes for them.
  kind text not null default 'couple',
  capacity int not null default 2,
  created_at timestamptz not null default now()
);

create table if not exists invites (
  code text primary key,
  space_id uuid not null references spaces(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists pages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  title text not null,
  icon text,
  parent_id uuid references pages(id) on delete cascade,
  kind text not null default 'page',
  owner_uid text,
  "order" int not null default 0,
  trashed boolean not null default false,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  page_id uuid not null references pages(id) on delete cascade,
  type text not null,
  content jsonb not null default '{}',
  width int not null default 100,
  "order" int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  name text not null,
  size bigint not null,
  storage_path text not null,   -- '<space_id>/<generated-name>' inside the 'cosy-files' bucket
  created_at timestamptz not null default now()
);

-- Upgrade guards: no-ops on a fresh project; on a project carrying an
-- older schema they add any column a previous version lacked. Only
-- columns that are safe to add to a table that already has rows are
-- listed (nullable, or NOT NULL with a default) — core identity columns
-- have existed in every shipped version.
alter table spaces
  add column if not exists member_profiles jsonb not null default '{}',
  add column if not exists section_names jsonb not null default '{}',
  add column if not exists theme jsonb,
  add column if not exists kind text not null default 'couple',
  add column if not exists capacity int not null default 2;
alter table pages
  add column if not exists icon text,
  add column if not exists kind text not null default 'page',
  add column if not exists owner_uid text,
  add column if not exists "order" int not null default 0,
  add column if not exists trashed boolean not null default false,
  add column if not exists trashed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
alter table blocks
  add column if not exists width int not null default 100,
  add column if not exists "order" int not null default 0,
  add column if not exists updated_at timestamptz not null default now();

-- Drop EVERY existing overload of our functions before recreating them —
-- an older deploy's version may have a different signature, and CREATE
-- alone can't replace across a signature change. CASCADE also removes
-- any triggers and RLS policies that referenced these functions
-- (including the Part 3 storage-bucket policy, if present); every
-- trigger/policy this schema needs is recreated below, and Part 3 must
-- be re-applied after a re-run.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_space_member', 'can_see_page', 'touch_updated_at',
                        'protect_space_membership', 'join_space',
                        'set_member_profile', 'reorder_blocks',
                        'remove_member', 'delete_account')
  loop
    execute format('drop function %s cascade', f.sig);
  end loop;
end $$;

-- ─────────────────────────── 2. HELPER FUNCTIONS ───────────────────────────

-- Used by pages/blocks/files RLS policies (a plain, cheap membership check).
create function is_space_member(sid uuid) returns boolean
language sql security definer stable as $$
  select auth.uid() = any(members) from spaces where id = sid;
$$;

-- Is this page visible to the caller? A page the app calls "private" is a
-- kind='page' row whose owner_uid is a specific member's uid (the visibility
-- toggle in the page header sets it; 'shared' / null mean everyone). app.js
-- already filters other people's private pages out of the sidebar — but
-- filtering client-side only hides them, it still SENDS them, so a member
-- could read a partner's private pages straight off the REST API. This is
-- what actually withholds the row. 'home'/'personal' pages are structural
-- (every member needs to see that they exist) and are never private.
-- SECURITY DEFINER so the blocks policy can consult it without recursing
-- back through pages' own RLS.
create function can_see_page(pid uuid) returns boolean
language sql security definer stable as $$
  select is_space_member(p.space_id)
     and (p.kind <> 'page'
          or p.owner_uid is null
          or p.owner_uid = 'shared'
          or p.owner_uid = auth.uid()::text)
    from pages p where p.id = pid;
$$;

-- Auto-bumps updated_at on every UPDATE to pages/blocks. storage.js ALSO
-- sets updated_at explicitly on every write (belt-and-suspenders), so the
-- "unread page" dots keep working even if this trigger is ever accidentally
-- dropped in a future migration — but this trigger is the source of truth.
create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Closes the one real hole in a members-only UPDATE policy: RLS's
-- `WITH CHECK` only ever sees the proposed NEW row, so it cannot by itself
-- compare "did members/member_profiles actually change" against the OLD
-- row — only a real trigger (which gets both OLD and NEW) can do that
-- reliably. Any direct client UPDATE that touches members or
-- member_profiles is rejected UNLESS the `cosy.rpc` session flag is set,
-- which only the four SECURITY DEFINER functions below ever set (and only
-- for the duration of their own call). This means every membership/profile
-- change — even the very first one, a couple's own creator-membership at
-- space-creation time — must go through the app's normal INSERT (which
-- already puts the creator in `members` from the start, so no RPC is
-- needed there) or through join_space / set_member_profile / remove_member
-- from then on. Direct client UPDATE calls may still freely change
-- theme / section_names / name / invite_code.
create function protect_space_membership() returns trigger
language plpgsql as $$
begin
  if (new.members is distinct from old.members
      or new.member_profiles is distinct from old.member_profiles)
     and coalesce(current_setting('cosy.rpc', true), '') <> 'on' then
    raise exception 'members and member_profiles can only change via join_space / set_member_profile / remove_member';
  end if;
  return new;
end;
$$;

-- ─────────────────────── 3. INDEXES + TRIGGERS ───────────────────────

-- At most one 'home' page per space, and at most one 'personal' page per
-- (space, real uid) — the placeholder owner_uid 'partner-slot' is
-- excluded so the single-member "their side isn't here yet" placeholder
-- page never collides with this constraint.
drop index if exists one_home_per_space;
drop index if exists one_personal_per_owner;
create unique index one_home_per_space on pages(space_id) where kind = 'home';
create unique index one_personal_per_owner on pages(space_id, owner_uid)
  where kind = 'personal' and owner_uid <> 'partner-slot';

-- (The three triggers below were already dropped by the function CASCADE
-- above if they existed; the explicit drops also catch a trigger that
-- somehow survived with a different function attached.)
drop trigger if exists pages_touch_updated_at on pages;
create trigger pages_touch_updated_at
  before update on pages
  for each row execute function touch_updated_at();

drop trigger if exists blocks_touch_updated_at on blocks;
create trigger blocks_touch_updated_at
  before update on blocks
  for each row execute function touch_updated_at();

drop trigger if exists spaces_protect_membership on spaces;
create trigger spaces_protect_membership
  before update on spaces
  for each row execute function protect_space_membership();

-- ───────────────────────────── 4. RPCs ─────────────────────────────
-- These are the ONLY code paths allowed to change `members` /
-- `member_profiles` on a space (see protect_space_membership above).
-- All four: SECURITY DEFINER, search_path pinned to `public` (so nobody
-- can hijack them by creating same-named objects in another schema),
-- and derive the caller's identity from auth.uid() — never from a
-- parameter — so a member can only ever act as themselves.

-- join_space: looks up the invite by CODE (never by space id — the
-- client no longer reads the invites table at all, see Part 2's RLS
-- section). Enforces the corner's own `capacity` (couples = 2, groups up
-- to 8). Idempotent: calling it again with a code you already redeemed
-- just returns the space unchanged.
create function join_space(p_code text, p_name text, p_photo text)
returns setof spaces
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_space_id uuid;
  v_member_count int;
  v_capacity int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select space_id into v_space_id from invites where code = upper(trim(p_code));
  if v_space_id is null then
    raise exception 'no cosy corner found for that code — double-check it and try again';
  end if;

  -- Idempotent: already a member of this space, nothing to do.
  if exists (select 1 from spaces where id = v_space_id and v_uid = any(members)) then
    return query select * from spaces where id = v_space_id;
    return;
  end if;

  select array_length(members, 1), capacity
    into v_member_count, v_capacity
    from spaces where id = v_space_id;
  -- coalesce(capacity, 2): a row created before the capacity column existed
  -- was a couple, so it still fits two.
  if coalesce(v_member_count, 0) >= coalesce(v_capacity, 2) then
    raise exception 'this corner is already full';
  end if;

  perform set_config('cosy.rpc', 'on', true);

  update spaces set
    members = array_append(members, v_uid),
    member_profiles = coalesce(member_profiles, '{}'::jsonb) || jsonb_build_object(
      v_uid::text, jsonb_build_object(
        'name', coalesce(p_name, 'Someone'), 'photo', coalesce(p_photo, ''), 'mood', ''
      )
    )
  where id = v_space_id;

  return query select * from spaces where id = v_space_id;
end;
$$;

-- set_member_profile: merges p_patch into member_profiles for the
-- CALLER'S OWN uid only — there is no uid parameter, so a member can
-- never write into someone else's profile entry.
create function set_member_profile(p_space_id uuid, p_patch jsonb)
returns setof spaces
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from spaces where id = p_space_id and v_uid = any(members)) then
    raise exception 'not a member of this corner';
  end if;

  perform set_config('cosy.rpc', 'on', true);

  update spaces set
    member_profiles = coalesce(member_profiles, '{}'::jsonb) || jsonb_build_object(
      v_uid::text,
      coalesce(member_profiles -> v_uid::text, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
    )
  where id = p_space_id;

  return query select * from spaces where id = p_space_id;
end;
$$;

-- reorder_blocks: one atomic statement instead of N parallel per-row
-- updates — also membership-checked so a non-member can't reorder a
-- space's blocks even if they somehow guessed block ids.
create function reorder_blocks(p_space_id uuid, p_ids uuid[], p_orders int[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from spaces where id = p_space_id and v_uid = any(members)) then
    raise exception 'not a member of this corner';
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  update blocks set "order" = o.ord
  from unnest(p_ids, p_orders) as o(id, ord)
  where blocks.id = o.id and blocks.space_id = p_space_id;
end;
$$;

-- remove_member: powers both "leave this corner" (caller removes
-- themselves) and a future evict flow. Caller must already be a member
-- of the space to remove anyone from it.
create function remove_member(p_space_id uuid, p_uid text)
returns setof spaces
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from spaces where id = p_space_id and v_uid = any(members)) then
    raise exception 'not a member of this corner';
  end if;

  perform set_config('cosy.rpc', 'on', true);

  update spaces set
    members = array_remove(members, p_uid::uuid),
    member_profiles = coalesce(member_profiles, '{}'::jsonb) - p_uid
  where id = p_space_id;

  return query select * from spaces where id = p_space_id;
end;
$$;

-- delete_account: erases the CALLER's account. Corners shared with a
-- partner survive — the caller is removed from them exactly like
-- remove_member. Corners where the caller is the ONLY member are deleted
-- outright (pages/blocks/files rows cascade via FK). Finally the
-- auth.users row itself is deleted (Supabase cascades sessions and
-- identities from it). NOTE: Storage OBJECTS (uploaded file bytes) for
-- solo corners must be removed by the CLIENT before calling this — while
-- still a member the bucket policy allows it; afterwards nobody could.
create function delete_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  perform set_config('cosy.rpc', 'on', true);

  for s in select id, members from spaces where v_uid = any(members) loop
    if coalesce(array_length(s.members, 1), 0) <= 1 then
      delete from spaces where id = s.id;
    else
      update spaces set
        members = array_remove(members, v_uid),
        member_profiles = coalesce(member_profiles, '{}'::jsonb) - v_uid::text
      where id = s.id;
    end if;
  end loop;

  delete from auth.users where id = v_uid;
end;
$$;

-- Explicit grants: PostgREST/Supabase exposes every function to the
-- `anon` role by default too, so revoke first and grant only to
-- `authenticated` — an anonymous (signed-out) caller should never be
-- able to invoke any of these, even though each one also independently
-- checks auth.uid() is not null.
revoke execute on function join_space(text, text, text) from public;
revoke execute on function set_member_profile(uuid, jsonb) from public;
revoke execute on function reorder_blocks(uuid, uuid[], int[]) from public;
revoke execute on function remove_member(uuid, text) from public;
revoke execute on function delete_account() from public;
grant execute on function join_space(text, text, text) to authenticated;
grant execute on function set_member_profile(uuid, jsonb) to authenticated;
grant execute on function reorder_blocks(uuid, uuid[], int[]) to authenticated;
grant execute on function remove_member(uuid, text) to authenticated;
grant execute on function delete_account() to authenticated;

-- ────────────────────────── 5. ROW LEVEL SECURITY ──────────────────────────

-- Sweep every existing policy on our five tables first. An older deploy's
-- policies may have different NAMES than the ones below, and two
-- overlapping permissive policies OR together — a leftover loose policy
-- would silently defeat a tightened one. Dropping by catalog lookup (not
-- by guessed name) guarantees the recreated set below is the ONLY set.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('spaces', 'invites', 'pages', 'blocks', 'files')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

alter table spaces enable row level security;
create policy "select own spaces" on spaces for select
  using (auth.uid() = any(members));
create policy "insert own space" on spaces for insert
  with check (auth.uid() = any(members));
-- Membership check only — the protect_space_membership trigger above is
-- what actually stops members/member_profiles being smuggled through a
-- direct client UPDATE call; this policy just gates "must be a current
-- member to update this row at all," same as before.
create policy "update as member" on spaces for update
  using (auth.uid() = any(members)) with check (auth.uid() = any(members));
create policy "delete as member" on spaces for delete
  using (auth.uid() = any(members));

-- Invites are now WRITE-only from the client's point of view. Nobody can
-- SELECT from this table directly (no policy = no rows, since RLS
-- defaults to deny) — joining a space happens exclusively through
-- join_space(p_code), which is SECURITY DEFINER and reads invites
-- internally, bypassing this restriction safely because it only ever
-- returns the ONE space matching the code the caller already typed in,
-- never a list of other people's invites.
alter table invites enable row level security;
create policy "create invite as member" on invites for insert
  with check (is_space_member(space_id));

alter table pages enable row level security;
-- Membership AND page-level privacy (see can_see_page above): a member of
-- the corner still cannot read — or write to — another member's private
-- page. Without the second clause the "private / hidden from everyone else"
-- toggle in the page header was purely cosmetic, enforced only by app.js.
create policy "pages by member" on pages for all
  using (
    is_space_member(space_id)
    and (kind <> 'page' or owner_uid is null or owner_uid = 'shared'
         or owner_uid = auth.uid()::text)
  )
  with check (
    is_space_member(space_id)
    and (kind <> 'page' or owner_uid is null or owner_uid = 'shared'
         or owner_uid = auth.uid()::text)
  );

alter table blocks enable row level security;
-- A block inherits its page's privacy — otherwise the page row would be
-- hidden while everything written on it stayed readable.
create policy "blocks by member" on blocks for all
  using (is_space_member(space_id) and can_see_page(page_id))
  with check (is_space_member(space_id) and can_see_page(page_id));

alter table files enable row level security;
create policy "files by member" on files for all
  using (is_space_member(space_id)) with check (is_space_member(space_id));

-- ────────────────────────────── 6. REALTIME ──────────────────────────────
-- One table per statement, each tolerating "already in the publication"
-- (SQLSTATE 42710) so a re-run doesn't fail on tables a previous deploy
-- already added.

do $$ begin
  alter publication supabase_realtime add table spaces;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table pages;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table blocks;
exception when duplicate_object then null; end $$;
```

You should see **Success. No rows returned**. That's the entire database.

### Why the `spaces` UPDATE policy looks "loose" — and what actually guards it

At first glance, `"update as member"` above only checks that the caller is
already a member — it doesn't look like it stops a member from rewriting
`members`/`member_profiles` themselves (e.g. adding a third person, or
editing their partner's name). **That's intentional and it's not a gap**:
Postgres RLS's `WITH CHECK` clause only ever sees the *proposed new row* —
it has no built-in way to compare it against the *old* row's values, so
trying to express "members must be unchanged" as a bare RLS check is either
impossible or relies on subtle, hard-to-verify snapshot semantics I can't
test live here. A real `BEFORE UPDATE` trigger, by contrast, gets both
`OLD` and `NEW` records — a well-defined, ordinary Postgres mechanism — so
`protect_space_membership()` (Part 2, step 2) is the actual enforcement:
it raises on any client attempt to change those two columns unless the
`cosy.rpc` session flag is set, and only `join_space` / `set_member_profile`
/ `remove_member` ever set that flag (scoped to their own call via
`set_config(..., true)`, i.e. `SET LOCAL` semantics — it evaporates at the
end of the RPC's transaction and never leaks into an unrelated request).
This also means the trigger applies to **every** UPDATE on `spaces`,
including the RPCs' own — even though they run SECURITY DEFINER, triggers
fire regardless of the calling role, so the RPCs have to explicitly opt in
every time, rather than silently getting a free pass by virtue of being
"the trusted code path."

If you'd rather not reason about a session GUC at all, the simpler
fallback the app was designed to tolerate is: drop the trigger, and instead
require literally **all** membership/profile changes (including the very
first "creator joins" write) to route through a `create_space` RPC +
the three RPCs above, with the plain UPDATE policy's `WITH CHECK` left as
just `auth.uid() = any(members)`. The GUC+trigger approach above was kept
as the primary design because it's strictly more defensive (it still holds
even if a future migration adds `FORCE ROW LEVEL SECURITY` or changes who
owns these functions) and doesn't require moving space-creation into an
RPC — but if a future maintainer finds the GUC dance too clever, the
fallback is a straightforward, smaller diff.

---

## Part 3 — File storage bucket

1. Left sidebar → **Storage** → **New bucket**. Name it exactly
   `cosy-files`, leave it **private** (not public), click **Create bucket**.
2. Click into the `cosy-files` bucket → **Policies** tab → **New policy** →
   choose the "for full customization"/custom SQL option (or just run this
   in the SQL Editor as a follow-up query — either works) and paste:

    ```sql
    -- Sweep any previous cosy-files policy first (found by catalog lookup,
    -- since an older deploy's policy may have a different name — e.g. the
    -- old single-tenant "any authenticated user" one). Two overlapping
    -- permissive policies would OR together and the looser one would win.
    -- Also needed after RE-RUNNING Part 2: its function drop cascades away
    -- this policy, so it must be re-created.
    do $$
    declare pol record;
    begin
      for pol in
        select policyname from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and (coalesce(qual, '') like '%cosy-files%'
               or coalesce(with_check, '') like '%cosy-files%')
      loop
        execute format('drop policy %I on storage.objects', pol.policyname);
      end loop;
    end $$;

    -- Object paths are always '<space_id>/<generated-name>' (storage.js
    -- writes them that way — see uploadFileData). storage.foldername(name)
    -- splits the path on '/' and returns a text[]; index [1] (Postgres
    -- arrays are 1-based) is that leading space_id segment. This scopes
    -- read/write/replace/delete on every object to members of the space
    -- whose id is embedded in the path — NOT "any authenticated user,"
    -- which was the old single-tenant policy and is no longer safe now
    -- that many unrelated couples share this one bucket.
    create policy "cosy-files scoped to membership"
    on storage.objects for all
    using (
      bucket_id = 'cosy-files'
      and is_space_member((storage.foldername(name))[1]::uuid)
    )
    with check (
      bucket_id = 'cosy-files'
      and is_space_member((storage.foldername(name))[1]::uuid)
    );
    ```

    The sweep at the top handles older/looser bucket policies from a
    previous deploy automatically. If any statement here fails with
    **"must be owner of table objects"** (Supabase has been tightening
    SQL-editor access to the `storage` schema over time), do the same two
    steps through the dashboard instead: delete the old cosy-files
    policies in the bucket's **Policies** tab, then add the membership
    policy above via **New policy → full customization**.

---

## Part 4 — Turn on Google sign-in (and take it out of "testing")

1. Left sidebar → **Authentication → Sign in / Providers** → find
   **Google** → toggle it **on**.
2. You need a Google OAuth **Client ID** and **Client Secret**:
   - Go to **https://console.cloud.google.com/apis/credentials**, pick or
     create a project, **Create credentials → OAuth client ID**.
   - If asked, configure the **OAuth consent screen** first: **External**
     user type, fill in the app name, support email, and developer contact
     email.
   - **Scopes**: this app only ever asks for the default `email` and
     `profile` scopes — it never requests anything Google classifies as
     "sensitive" or "restricted."
   - **Application type: Web application**. Under **Authorised redirect
     URIs**, add the callback URL Supabase shows on its Google provider
     settings page (looks like
     `https://<your-project-ref>.supabase.co/auth/v1/callback` — copy it
     exactly from that screen).
   - Click **Create**, copy the **Client ID** and **Client Secret**.
3. Paste the Client ID + Client Secret into Supabase's Google provider
   fields and **Save**.
4. **Publish the consent screen.** This is the step that's easy to skip and
   was optional back when this app was single-couple/self-hosted with a
   fixed "Test users" allow-list — it is **not optional now**. A consent
   screen left in "Testing" mode only allows the specific test-user emails
   you added to sign in at all; every other couple downloading the app will
   hit a hard Google error. In Google Cloud Console → **OAuth consent
   screen**, click **Publish App** and confirm.
   - Because this app only requests the basic `email`/`profile` scopes (not
     any "sensitive" or "restricted" scope), publishing does **not**
     require Google's manual security review.
   - Google's automatic verification requirement kicks in once the app
     passes **100 total users** (or immediately, regardless of user count,
     for apps using sensitive/restricted scopes — which this one doesn't).
     Past that threshold you may see an "unverified app" warning for new
     sign-ins until you complete Google's verification form (a short
     process for basic-scope apps: confirm domain ownership, add a privacy
     policy URL, etc.). Plan for this before you expect meaningful growth,
     not after.
5. Still in **Authentication**, open **URL Configuration** and add these
   **exact** entries to **Redirect URLs** (all three — one primary, two
   fallbacks in case the primary port is ever busy on a user's machine):
   ```
   http://127.0.0.1:53682
   http://127.0.0.1:53683
   http://127.0.0.1:53684
   ```
   Click **Save**. (See the app's `main.js`/`preload.js` OAuth loopback
   handler for why these are fixed ports rather than a wildcard —
   Supabase, as the registered OAuth client with Google, matches redirect
   URLs by exact address, so the desktop app always asks for one of these
   three fixed local ports rather than an arbitrary one.)

---

## Part 5 — Set Auth rate limits

Left sidebar → **Authentication → Rate Limits**. With every couple in the
world hitting the same project, the defaults are a reasonable starting
point, but review them before a public launch — in particular the limits
on sign-ups/sign-ins and token refresh per hour. Set these to whatever your
expected traffic and abuse tolerance justify; Supabase's dashboard exposes
these as plain per-hour numbers you can tune without touching SQL. Revisit
this after launch if you see either legitimate users getting throttled or
suspicious spikes.

---

## Part 6 — Get your project keys and finish the build

1. Left sidebar → **Project Settings → API**. Copy the **Project URL** and
   the **anon / public** key.
2. Open **`supabase-config.js`** in the project folder and replace the two
   `PASTE_...` placeholders in `window.SUPABASE_CONFIG` with those two
   values.
3. Save the file, then build/run the app as usual (`npm start` for a local
   check; see `SHIP-CHECKLIST.md` for packaging the distributable macOS
   `.dmg` / Windows installer — that part of the pipeline is out of scope
   for this document, which only covers the shared backend).

Once `supabase-config.js` no longer has placeholder values, the app boots
straight into cloud mode for every user who downloads it — there is no
separate "connect to the cloud" step for end users beyond signing in with
Google and clicking **Create our corner** or **Join with a code**.

---

## Security notes

- **The anon/public key is public by design.** It ends up bundled inside
  every copy of the downloadable app, and that's expected — Supabase's
  anon key is meant to be exposed client-side. It grants *no* access on its
  own; every table has RLS enabled, so the anon key only ever unlocks rows
  the signed-in caller's `auth.uid()` is actually allowed to see under the
  policies above. **RLS is the real security boundary, not secrecy of this
  key.**
- If the anon key is ever compromised in a way that matters (e.g. you
  suspect the *service_role* key leaked, or you want to invalidate old
  builds), rotate it from **Project Settings → API** — existing installed
  apps with the old key baked in will need a new build with the refreshed
  key.
- **Never ship the `service_role` key** anywhere near the client — not in
  `supabase-config.js`, not in a build artifact, not in a log. It bypasses
  RLS entirely. This app has no legitimate use for it; if you ever find a
  reason to reach for it, that's a sign the task belongs in a server-side
  admin tool, not the desktop client.

## Abuse & limits

- **Capacity cap**: enforced server-side inside `join_space` (raises if the
  space already holds `capacity` members and the caller isn't one of them) —
  not just a client-side UI suggestion, so it holds even against a modified
  client. `capacity` is set once at creation (couples = 2, friends/family up
  to 8) and never sent by the joining client, so it can't be inflated.
- **Supabase project-level rate limits** (Part 5) are your main lever
  against a runaway or malicious client hammering auth/sign-in endpoints
  across all tenants sharing this one project.
- **Per-space file storage quota** is a known gap, not yet enforced —
  today a couple could in principle upload an unbounded amount into
  `cosy-files`. Worth adding (e.g. a trigger or scheduled check against
  summed `files.size` per `space_id`, or a Storage-level per-bucket quota
  if/when Supabase exposes one) before this app has enough real-world
  traffic for it to matter, but it's an intentionally deferred item for
  this round, not an oversight to silently ignore later.

---

## Troubleshooting (backend deploy)

- **`ERROR: 42P07: relation "spaces" already exists`.** You're running a
  pre-idempotency version of the Part 2 block (plain `create table`) on a
  project that already has the schema. Re-copy the current block from this
  file — it starts with `create table if not exists` and upgrades an
  existing schema in place. Remember to re-apply Part 3 afterwards.
- **`could not create unique index "one_home_per_space"` (or
  `one_personal_per_owner`) during a re-run.** Your existing data already
  violates the new one-home-page / one-personal-page-per-person rule
  (possible if it was created before those rules existed). Find the
  duplicates with
  `select space_id, count(*) from pages where kind = 'home' and not trashed group by 1 having count(*) > 1;`
  and delete/re-kind the extras — or, if the project only holds test data,
  simply reset: `drop table if exists files, blocks, pages, invites, spaces cascade;`
  then run the full Part 2 block and Part 3 again from scratch.
- **"Still seeing the local-mode banner after editing the config?"** Make
  sure `url` and `anonKey` in `supabase-config.js` no longer start with
  `PASTE_`, and fully quit + relaunch the app.
- **"redirect_uri_mismatch" after approving Google.** Double-check Part 4
  step 5 — all three `http://127.0.0.1:5368{2,3,4}` entries must be listed
  *exactly* (no trailing slash) under Supabase's Redirect URLs, and the
  callback URL in Google Cloud Console must be Supabase's own
  `.../auth/v1/callback`, not a `127.0.0.1` address.
- **"This app isn't verified" for real users (not just you testing).**
  Confirm the consent screen is actually **Published**, not just
  configured (Part 4 step 4) — a configured-but-unpublished screen still
  shows this to anyone not on the Test users list.
- **A couple reports they can't invite/join at all, but no error appears.**
  Check that the `invites` row for their space actually exists — it's
  created by the app's `createSpace` flow; a space with no matching
  `invites.code` row will make `join_space` correctly (and silently, from
  the joiner's point of view) report "no cosy corner found for that code."
- **A PDF/file shows "this file lives on their Mac 💾" for one partner
  forever.** That's the expected fallback for files uploaded before the
  space had real Supabase Storage syncing (or for very old data) — a
  re-upload fixes it going forward, this isn't a backend misconfiguration.
- **`delete_account` fails with "permission denied for table users".** Some
  Supabase projects restrict the `postgres` role's rights on the `auth`
  schema. Run `grant delete on table auth.users to postgres;` once in the
  SQL editor, then retry.
