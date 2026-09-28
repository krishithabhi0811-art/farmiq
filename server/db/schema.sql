-- ═══════════════════════════════════════════════════════════════
--  FARM-IQ • Supabase / Postgres schema
--  Run automatically by:  npm run db:setup      (inside /server)
--  Safe to run many times — everything is IF NOT EXISTS / idempotent.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── profiles ──────────────────────────────────────────────────
create table if not exists public.profiles (
  id               uuid primary key default uuid_generate_v4(),
  email            text unique not null,
  password_hash    text not null,              -- bcrypt hash, never plain text
  full_name        text,
  language         text default 'en',
  district         text,
  land_size_acres  numeric default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

alter table public.profiles add column if not exists language         text default 'en';
alter table public.profiles add column if not exists district         text;
alter table public.profiles add column if not exists land_size_acres  numeric default 0;
alter table public.profiles add column if not exists updated_at       timestamptz default now();

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ── items : the farmer's saved records (CRUD) ─────────────────
create table if not exists public.items (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid references public.profiles(id) on delete cascade,
  title              text not null,
  description        text,
  ai_summary         text,
  category           text default 'crop',        -- crop|soil|pest|irrigation|fertilizer|weather|expense|other
  status             text default 'planned',     -- planned|growing|harvested|at_risk|solved
  crop_name          text,
  field_name         text,
  area_acres         numeric default 0,
  sowing_date        date,
  expected_yield_kg  numeric default 0,
  photo              text,                       -- small data:image/... preview
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.items add column if not exists ai_summary         text;
alter table public.items add column if not exists category           text default 'crop';
alter table public.items add column if not exists status             text default 'planned';
alter table public.items add column if not exists crop_name          text;
alter table public.items add column if not exists field_name         text;
alter table public.items add column if not exists area_acres         numeric default 0;
alter table public.items add column if not exists sowing_date        date;
alter table public.items add column if not exists expected_yield_kg  numeric default 0;
alter table public.items add column if not exists photo              text;
alter table public.items add column if not exists updated_at         timestamptz default now();

create index if not exists items_user_id_idx    on public.items (user_id);
create index if not exists items_created_at_idx on public.items (created_at desc);

-- ── soil_tests : saved soil fertility reports ─────────────────
create table if not exists public.soil_tests (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.profiles(id) on delete cascade,
  crop            text default 'other',
  field_name      text,
  area_acres      numeric default 1,
  ph              numeric default 7,
  organic_carbon  numeric default 0,
  nitrogen_n      numeric default 0,
  phosphorus_p    numeric default 0,
  potassium_k     numeric default 0,
  ec              numeric default 0,
  report          jsonb default '{}'::jsonb,
  ai_plan         text,
  created_at      timestamptz default now()
);

create index if not exists soil_tests_user_id_idx on public.soil_tests (user_id);

-- ── chat history (optional, keeps the AI assistant memory across devices) ──
create table if not exists public.ai_messages (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id) on delete cascade,
  role        text not null,
  content     text not null,
  created_at  timestamptz default now()
);
create index if not exists ai_messages_user_id_idx on public.ai_messages (user_id, created_at);

-- ── updated_at trigger ────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY
--  Enabled on every table. Policies tie rows to auth.uid(), so the
--  public anon key can read nothing. The trusted backend uses the
--  service_role key and scopes every query to the logged-in user id.
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles    enable row level security;
alter table public.items       enable row level security;
alter table public.soil_tests  enable row level security;
alter table public.ai_messages enable row level security;

-- profiles: a user sees and updates only their own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- items: full CRUD on your own rows only
drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items
  for select using (auth.uid() = user_id);

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items
  for insert with check (auth.uid() = user_id);

drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items
  for delete using (auth.uid() = user_id);

-- soil tests: full CRUD on your own rows only
drop policy if exists "soil_select_own" on public.soil_tests;
create policy "soil_select_own" on public.soil_tests
  for select using (auth.uid() = user_id);
drop policy if exists "soil_insert_own" on public.soil_tests;
create policy "soil_insert_own" on public.soil_tests
  for insert with check (auth.uid() = user_id);
drop policy if exists "soil_update_own" on public.soil_tests;
create policy "soil_update_own" on public.soil_tests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "soil_delete_own" on public.soil_tests;
create policy "soil_delete_own" on public.soil_tests
  for delete using (auth.uid() = user_id);

-- ai messages
drop policy if exists "ai_select_own" on public.ai_messages;
create policy "ai_select_own" on public.ai_messages
  for select using (auth.uid() = user_id);
drop policy if exists "ai_insert_own" on public.ai_messages;
create policy "ai_insert_own" on public.ai_messages
  for insert with check (auth.uid() = user_id);
drop policy if exists "ai_delete_own" on public.ai_messages;
create policy "ai_delete_own" on public.ai_messages
  for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
--  FIELD CAMERAS — a camera fixed in the field uploads photos on a
--  timer; the farmer opens them in the app. Devices authenticate with
--  a per-camera device key (x-camera-key header) through the backend.
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.cameras (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid references public.profiles(id) on delete cascade,
  name                     text not null,
  field_name               text,
  location_note            text,
  device_key               text not null,          -- shown only to its owner
  capture_interval_minutes integer default 60,
  is_active                boolean default true,
  auto_analyse             boolean default false,  -- AI-check every uploaded photo
  last_seen_at             timestamptz,
  last_note                text,
  battery                  text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

alter table public.cameras add column if not exists field_name               text;
alter table public.cameras add column if not exists location_note            text;
alter table public.cameras add column if not exists capture_interval_minutes integer default 60;
alter table public.cameras add column if not exists is_active                boolean default true;
alter table public.cameras add column if not exists auto_analyse             boolean default false;
alter table public.cameras add column if not exists last_seen_at             timestamptz;
alter table public.cameras add column if not exists last_note                text;
alter table public.cameras add column if not exists battery                  text;
alter table public.cameras add column if not exists updated_at               timestamptz default now();

create index if not exists cameras_user_idx on public.cameras (user_id);
create unique index if not exists cameras_device_key_idx on public.cameras (device_key);

create table if not exists public.camera_photos (
  id          uuid primary key default uuid_generate_v4(),
  camera_id   uuid references public.cameras(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  image       text not null,       -- data:image/jpeg;base64,…
  ai_note     text,                -- AI field reading, if asked for
  note        text,                -- note sent by the device
  battery     text,
  captured_at timestamptz default now(),
  created_at  timestamptz default now()
);

alter table public.camera_photos add column if not exists ai_note text;
alter table public.camera_photos add column if not exists note    text;
alter table public.camera_photos add column if not exists battery text;

create index if not exists camera_photos_camera_idx on public.camera_photos (camera_id, captured_at desc);
create index if not exists camera_photos_user_idx   on public.camera_photos (user_id, created_at desc);

drop trigger if exists cameras_touch on public.cameras;
create trigger cameras_touch before update on public.cameras
  for each row execute function public.touch_updated_at();

alter table public.cameras       enable row level security;
alter table public.camera_photos enable row level security;

drop policy if exists "cameras_select_own" on public.cameras;
create policy "cameras_select_own" on public.cameras
  for select using (auth.uid() = user_id);
drop policy if exists "cameras_insert_own" on public.cameras;
create policy "cameras_insert_own" on public.cameras
  for insert with check (auth.uid() = user_id);
drop policy if exists "cameras_update_own" on public.cameras;
create policy "cameras_update_own" on public.cameras
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "cameras_delete_own" on public.cameras;
create policy "cameras_delete_own" on public.cameras
  for delete using (auth.uid() = user_id);

drop policy if exists "camera_photos_select_own" on public.camera_photos;
create policy "camera_photos_select_own" on public.camera_photos
  for select using (auth.uid() = user_id);
drop policy if exists "camera_photos_insert_own" on public.camera_photos;
create policy "camera_photos_insert_own" on public.camera_photos
  for insert with check (auth.uid() = user_id);
drop policy if exists "camera_photos_delete_own" on public.camera_photos;
create policy "camera_photos_delete_own" on public.camera_photos
  for delete using (auth.uid() = user_id);
