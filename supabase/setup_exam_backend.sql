create extension if not exists pgcrypto with schema extensions;

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_slug text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null default 'Galina',
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists exam_attempts_exam_slug_owner_idx on public.exam_attempts (exam_slug, owner_id);
create index if not exists exam_attempts_exam_slug_updated_idx on public.exam_attempts (exam_slug, updated_at desc);

grant select, insert, update on public.exam_attempts to authenticated;

create or replace function public.exam_attempts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.exam_attempts_protect_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (new.owner_id <> old.owner_id or new.exam_slug <> old.exam_slug) then
    raise exception 'owner_id and exam_slug cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists exam_attempts_set_updated_at on public.exam_attempts;
create trigger exam_attempts_set_updated_at
before update on public.exam_attempts
for each row
execute function public.exam_attempts_set_updated_at();

drop trigger if exists exam_attempts_protect_identity on public.exam_attempts;
create trigger exam_attempts_protect_identity
before update on public.exam_attempts
for each row
execute function public.exam_attempts_protect_identity();

alter table public.exam_attempts enable row level security;

drop policy if exists exam_attempts_student_select on public.exam_attempts;
create policy exam_attempts_student_select
on public.exam_attempts
for select
to authenticated
using (
  (
    auth.uid() = owner_id
    and coalesce(auth.jwt() ->> 'email', '') = 'galina-unit45-exam@private-exam.test'
  )
  or coalesce(auth.jwt() ->> 'email', '') = 'ramazan-review@private-exam.test'
);

drop policy if exists exam_attempts_student_insert on public.exam_attempts;
create policy exam_attempts_student_insert
on public.exam_attempts
for insert
to authenticated
with check (
  auth.uid() = owner_id
  and coalesce(auth.jwt() ->> 'email', '') = 'galina-unit45-exam@private-exam.test'
);

drop policy if exists exam_attempts_update_access on public.exam_attempts;
create policy exam_attempts_update_access
on public.exam_attempts
for update
to authenticated
using (
  (
    auth.uid() = owner_id
    and coalesce(auth.jwt() ->> 'email', '') = 'galina-unit45-exam@private-exam.test'
  )
  or coalesce(auth.jwt() ->> 'email', '') = 'ramazan-review@private-exam.test'
)
with check (
  (
    auth.uid() = owner_id
    and coalesce(auth.jwt() ->> 'email', '') = 'galina-unit45-exam@private-exam.test'
  )
  or coalesce(auth.jwt() ->> 'email', '') = 'ramazan-review@private-exam.test'
);

drop policy if exists exam_recordings_student_select on storage.objects;
create policy exam_recordings_student_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exam-recordings'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or coalesce(auth.jwt() ->> 'email', '') = 'ramazan-review@private-exam.test'
  )
);

drop policy if exists exam_recordings_student_insert on storage.objects;
create policy exam_recordings_student_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exam-recordings'
  and auth.uid()::text = (storage.foldername(name))[1]
  and coalesce(auth.jwt() ->> 'email', '') = 'galina-unit45-exam@private-exam.test'
);

drop policy if exists exam_recordings_student_update on storage.objects;
create policy exam_recordings_student_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'exam-recordings'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or coalesce(auth.jwt() ->> 'email', '') = 'ramazan-review@private-exam.test'
  )
)
with check (
  bucket_id = 'exam-recordings'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or coalesce(auth.jwt() ->> 'email', '') = 'ramazan-review@private-exam.test'
  )
);

drop policy if exists exam_recordings_student_delete on storage.objects;
create policy exam_recordings_student_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'exam-recordings'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or coalesce(auth.jwt() ->> 'email', '') = 'ramazan-review@private-exam.test'
  )
);
