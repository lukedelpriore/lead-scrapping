-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'operator');

-- CreateEnum
CREATE TYPE "TriState" AS ENUM ('yes', 'no', 'unclear');

-- CreateEnum
CREATE TYPE "OwnershipType" AS ENUM ('group', 'private_owner', 'member_owned', 'municipal', 'unclear');

-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('open', 'suppressed', 'dropped');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('open', 'in_play', 'delivered');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('draft', 'queued', 'running', 'waiting_quota', 'needs_review', 'paused', 'done', 'done_pending_sheet', 'failed');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'waiting_quota', 'needs_review', 'paused', 'done', 'done_pending_sheet', 'failed');

-- CreateEnum
CREATE TYPE "RevealMode" AS ENUM ('auto', 'ask');

-- CreateEnum
CREATE TYPE "EventLevel" AS ENUM ('info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('venue', 'group');

-- CreateEnum
CREATE TYPE "CandidateRank" AS ENUM ('primary', 'alternate');

-- CreateEnum
CREATE TYPE "DedupeStatus" AS ENUM ('ready', 'duplicate', 'rejected');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('none', 'pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "VenueSourceKind" AS ENUM ('osm', 'rocketreach', 'serper', 'group_page', 'places', 'pasted', 'knot', 'weddingwire');

-- CreateEnum
CREATE TYPE "SuppressionKeyType" AS ENUM ('profile_id', 'linkedin', 'email', 'phone', 'name_employer', 'domain', 'venue_name_state', 'group');

-- CreateEnum
CREATE TYPE "SuppressionSource" AS ENUM ('luke_import', 'client', 'prospect', 'in_play', 'do_not_contact', 'delivered');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('charge', 'reconcile', 'reserve_change');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'operator',
    "password_hash" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "reserve_credits" INTEGER NOT NULL DEFAULT 200,
    "max_credits_per_request" INTEGER NOT NULL DEFAULT 100,
    "max_credits_per_day" INTEGER NOT NULL DEFAULT 300,
    "auto_reveal_min_confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "max_contacts_per_venue" INTEGER NOT NULL DEFAULT 2,
    "max_contacts_per_group" INTEGER NOT NULL DEFAULT 4,
    "search_quota_headroom" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "title_lists" JSONB NOT NULL,
    "state_order" JSONB NOT NULL,
    "notification_emails" JSONB NOT NULL,
    "spreadsheet_id" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "places_enabled" BOOLEAN NOT NULL DEFAULT false,
    "company_lookup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "states" JSONB NOT NULL,
    "group_ids" JSONB NOT NULL,
    "clubs_pasted" TEXT,
    "tiers" JSONB NOT NULL,
    "target_count" INTEGER NOT NULL,
    "credit_cap" INTEGER NOT NULL,
    "reveal_mode" "RevealMode" NOT NULL DEFAULT 'ask',
    "schedule" JSONB,
    "status" "RequestStatus" NOT NULL DEFAULT 'draft',
    "sheet_tab_name" TEXT,
    "sheet_url" TEXT,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "stage_counts" JSONB NOT NULL DEFAULT '{}',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "level" "EventLevel" NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "data" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "website" TEXT,
    "domain" TEXT,
    "main_line" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "osm_id" TEXT,
    "place_id" TEXT,
    "rr_company_id" TEXT,
    "ownership_type" "OwnershipType" NOT NULL DEFAULT 'unclear',
    "group_id" TEXT,
    "tier" INTEGER,
    "hosts_weddings" "TriState" NOT NULL DEFAULT 'unclear',
    "hosts_corporate" "TriState" NOT NULL DEFAULT 'unclear',
    "nonmember_events" "TriState" NOT NULL DEFAULT 'unclear',
    "evidence_url" TEXT,
    "evidence_phrase" TEXT,
    "capacity" INTEGER,
    "site_contact" JSONB,
    "classifier_confidence" DOUBLE PRECISION,
    "status" "VenueStatus" NOT NULL DEFAULT 'open',
    "qualified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_sources" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "source" "VenueSourceKind" NOT NULL,
    "source_ref" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "domain" TEXT,
    "rr_company_id" TEXT,
    "portfolio_url" TEXT,
    "venue_count" INTEGER NOT NULL DEFAULT 0,
    "states" JSONB NOT NULL DEFAULT '[]',
    "status" "GroupStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "target_type" "TargetType" NOT NULL,
    "venue_id" TEXT,
    "group_id" TEXT,
    "rr_profile_id" TEXT,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "title" TEXT,
    "employer" TEXT,
    "employer_normalized" TEXT,
    "linkedin_url" TEXT,
    "linkedin_normalized" TEXT,
    "location" TEXT,
    "rank" "CandidateRank" NOT NULL DEFAULT 'primary',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "dedupe_status" "DedupeStatus" NOT NULL DEFAULT 'ready',
    "dedupe_key" TEXT,
    "dedupe_source" TEXT,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "rr_profile_id" TEXT,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "employer" TEXT,
    "emails" JSONB NOT NULL DEFAULT '[]',
    "phones" JSONB NOT NULL DEFAULT '[]',
    "linkedin_url" TEXT,
    "has_mobile" BOOLEAN NOT NULL DEFAULT false,
    "has_verified_email" BOOLEAN NOT NULL DEFAULT false,
    "credit_charged" BOOLEAN NOT NULL DEFAULT false,
    "looked_up_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "venue_id" TEXT,
    "group_id" TEXT,
    "sheet_row_master" INTEGER,
    "sheet_row_request" INTEGER,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression" (
    "id" TEXT NOT NULL,
    "key_type" "SuppressionKeyType" NOT NULL,
    "key_value" TEXT NOT NULL,
    "display_name" TEXT,
    "display_company" TEXT,
    "source" "SuppressionSource" NOT NULL,
    "imported_from" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credits_ledger" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "LedgerKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "rr_person_exports_remaining" INTEGER,
    "run_id" TEXT,
    "contact_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credits_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_calls" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "cost_units" INTEGER NOT NULL DEFAULT 0,
    "request_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_status" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,
    "plan_name" TEXT,
    "limits" JSONB,
    "usage" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "states" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "counties" (
    "id" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fips" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "requests_status_idx" ON "requests"("status");

-- CreateIndex
CREATE INDEX "runs_request_id_idx" ON "runs"("request_id");

-- CreateIndex
CREATE INDEX "run_events_run_id_at_idx" ON "run_events"("run_id", "at");

-- CreateIndex
CREATE INDEX "run_events_run_id_level_idx" ON "run_events"("run_id", "level");

-- CreateIndex
CREATE INDEX "venues_state_status_tier_idx" ON "venues"("state", "status", "tier");

-- CreateIndex
CREATE INDEX "venues_domain_idx" ON "venues"("domain");

-- CreateIndex
CREATE INDEX "venues_name_normalized_state_idx" ON "venues"("name_normalized", "state");

-- CreateIndex
CREATE INDEX "venues_osm_id_idx" ON "venues"("osm_id");

-- CreateIndex
CREATE INDEX "venues_place_id_idx" ON "venues"("place_id");

-- CreateIndex
CREATE INDEX "venues_rr_company_id_idx" ON "venues"("rr_company_id");

-- CreateIndex
CREATE INDEX "venues_group_id_idx" ON "venues"("group_id");

-- CreateIndex
CREATE INDEX "venue_sources_venue_id_idx" ON "venue_sources"("venue_id");

-- CreateIndex
CREATE INDEX "venue_sources_source_idx" ON "venue_sources"("source");

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_normalized_key" ON "groups"("name_normalized");

-- CreateIndex
CREATE INDEX "groups_status_idx" ON "groups"("status");

-- CreateIndex
CREATE INDEX "groups_domain_idx" ON "groups"("domain");

-- CreateIndex
CREATE INDEX "candidates_run_id_dedupe_status_idx" ON "candidates"("run_id", "dedupe_status");

-- CreateIndex
CREATE INDEX "candidates_rr_profile_id_idx" ON "candidates"("rr_profile_id");

-- CreateIndex
CREATE INDEX "candidates_linkedin_normalized_idx" ON "candidates"("linkedin_normalized");

-- CreateIndex
CREATE INDEX "candidates_name_normalized_employer_normalized_idx" ON "candidates"("name_normalized", "employer_normalized");

-- CreateIndex
CREATE INDEX "candidates_review_status_idx" ON "candidates"("review_status");

-- CreateIndex
CREATE INDEX "contacts_candidate_id_idx" ON "contacts"("candidate_id");

-- CreateIndex
CREATE INDEX "contacts_rr_profile_id_idx" ON "contacts"("rr_profile_id");

-- CreateIndex
CREATE INDEX "leads_request_id_idx" ON "leads"("request_id");

-- CreateIndex
CREATE INDEX "leads_contact_id_idx" ON "leads"("contact_id");

-- CreateIndex
CREATE INDEX "suppression_key_type_idx" ON "suppression"("key_type");

-- CreateIndex
CREATE INDEX "suppression_source_idx" ON "suppression"("source");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_key_type_key_value_key" ON "suppression"("key_type", "key_value");

-- CreateIndex
CREATE INDEX "credits_ledger_at_idx" ON "credits_ledger"("at");

-- CreateIndex
CREATE INDEX "credits_ledger_run_id_idx" ON "credits_ledger"("run_id");

-- CreateIndex
CREATE INDEX "api_calls_provider_at_idx" ON "api_calls"("provider", "at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_status_provider_key" ON "integration_status"("provider");

-- CreateIndex
CREATE INDEX "counties_state_code_idx" ON "counties"("state_code");

-- CreateIndex
CREATE UNIQUE INDEX "counties_state_code_name_key" ON "counties"("state_code", "name");

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_sources" ADD CONSTRAINT "venue_sources_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counties" ADD CONSTRAINT "counties_state_code_fkey" FOREIGN KEY ("state_code") REFERENCES "states"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
