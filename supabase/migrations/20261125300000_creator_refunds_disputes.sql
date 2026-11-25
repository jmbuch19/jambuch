-- Creator's Space: refunds and bank disputes (Jaydeep, 25 Nov 2026).
-- Refunds: one row per refund, from the admin button or an automatic rule (duplicate
-- payment, sample not delivered within 3 days). Disputes: chargebacks reported by Razorpay.
-- Server-only writes; the writer can read their own rows.

create table public.creator_refunds (
  id                   bigint generated always as identity primary key,
  payment_id           bigint not null references public.creator_payments (id) on delete cascade,
  request_id           uuid not null references public.creator_requests (id) on delete cascade,
  razorpay_payment_id  text not null,              -- the payment refunded (a duplicate may differ from the recorded one)
  razorpay_refund_id   text unique,                -- set once Razorpay accepts the refund
  amount_paise         integer not null check (amount_paise > 0),
  reason               text not null check (reason in ('sample_not_delivered', 'duplicate_payment', 'our_mistake',
                                                         'goodwill', 'dispute_settled', 'other')),
  note                 text,
  by                   text not null,              -- 'admin' or 'auto:<rule>'
  status               text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  failure_reason       text,
  created_at           timestamptz not null default now(),
  processed_at         timestamptz
);

-- At most one refund in flight per payment, so a double click can't refund twice.
create unique index creator_refunds_one_pending on public.creator_refunds (razorpay_payment_id) where status = 'pending';
create index creator_refunds_request on public.creator_refunds (request_id, created_at desc);

alter table public.creator_refunds enable row level security;
create policy "creator refunds: own or admin" on public.creator_refunds
  for select to authenticated
  using (exists (select 1 from public.creator_requests r where r.id = request_id and r.user_id = (select auth.uid()))
         or (select private.is_admin()));

create table public.creator_disputes (
  id                   bigint generated always as identity primary key,
  razorpay_dispute_id  text not null unique,
  razorpay_payment_id  text not null,
  request_id           uuid references public.creator_requests (id) on delete set null,
  amount_paise         integer,
  reason_code          text,
  status               text not null,              -- Razorpay's: open, under_review, won, lost, closed
  respond_by           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.creator_disputes enable row level security;
create policy "creator disputes: admin" on public.creator_disputes
  for select to authenticated using ((select private.is_admin()));

-- The writer opened their sample (evidence for a dispute: when it was listened to).
alter table public.creator_requests
  add column sample_listened_at timestamptz,
  add column sample_remakes     integer not null default 0;   -- free remakes given (max 1: plan missed)
