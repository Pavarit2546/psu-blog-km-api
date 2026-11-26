import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_publication_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');
  CREATE TYPE "public"."enum_articles_visibility" AS ENUM('INTERNAL', 'PUBLIC');
  CREATE TYPE "public"."enum_articles_author_display" AS ENUM('REAL_NAME', 'PEN_NAME');
  CREATE TYPE "public"."enum_articles_publication_type" AS ENUM('COMMUNITY', 'ORGANIZATIONAL_KNOWLEDGE');
  CREATE TYPE "public"."enum_articles_verification_status" AS ENUM('NOT_SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'VERIFIED', 'REJECTED', 'REVOKED', 'REVERIFICATION_REQUIRED');
  CREATE TYPE "public"."enum__articles_v_version_publication_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');
  CREATE TYPE "public"."enum__articles_v_version_visibility" AS ENUM('INTERNAL', 'PUBLIC');
  CREATE TYPE "public"."enum__articles_v_version_author_display" AS ENUM('REAL_NAME', 'PEN_NAME');
  CREATE TYPE "public"."enum__articles_v_version_publication_type" AS ENUM('COMMUNITY', 'ORGANIZATIONAL_KNOWLEDGE');
  CREATE TYPE "public"."enum__articles_v_version_verification_status" AS ENUM('NOT_SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'VERIFIED', 'REJECTED', 'REVOKED', 'REVERIFICATION_REQUIRED');
  CREATE TYPE "public"."enum_communities_status" AS ENUM('ACTIVE', 'ARCHIVED');
  CREATE TYPE "public"."enum_media_media_type" AS ENUM('IMAGE', 'DOCUMENT');
  CREATE TYPE "public"."enum_comments_status" AS ENUM('VISIBLE', 'REPORTED', 'HIDDEN');
  CREATE TYPE "public"."enum_comments_author_display" AS ENUM('REAL_NAME', 'PEN_NAME');
  CREATE TYPE "public"."enum_verification_requests_status" AS ENUM('PENDING', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'AWAITING_DECISION', 'APPROVED', 'REJECTED', 'CANCELLED');
  CREATE TYPE "public"."enum_verification_requests_reviewer_recommendation" AS ENUM('RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION');
  CREATE TYPE "public"."enum_verification_reviews_role" AS ENUM('COP_SECRETARY', 'COP_REVIEWER', 'COP_APPROVER', 'ADMIN');
  CREATE TYPE "public"."enum_verification_reviews_decision" AS ENUM('REQUEST_REVISION', 'RECOMMEND_APPROVAL', 'RECOMMEND_REJECTION', 'APPROVE', 'REJECT', 'REVOKE');
  CREATE TYPE "public"."enum_notifications_notification_type" AS ENUM('VERIFICATION', 'COMMENT', 'COMMUNITY', 'SYSTEM', 'MODERATION');
  CREATE TYPE "public"."enum_users_global_roles" AS ENUM('PSU_PERSONNEL', 'HR_ADMIN', 'SUPER_ADMIN');
  CREATE TYPE "public"."enum_users_display_mode" AS ENUM('REAL_NAME', 'PEN_NAME');
  CREATE TYPE "public"."enum_users_status" AS ENUM('ACTIVE', 'SUSPENDED');
  CREATE TABLE "articles" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar NOT NULL,
  	"subtitle" varchar,
  	"content" jsonb,
  	"featured_image_id" uuid,
  	"excerpt" varchar,
  	"publication_status" "enum_articles_publication_status" DEFAULT 'DRAFT' NOT NULL,
  	"visibility" "enum_articles_visibility" DEFAULT 'INTERNAL' NOT NULL,
  	"community_id" uuid,
  	"author_display" "enum_articles_author_display",
  	"allow_comments" boolean DEFAULT true,
  	"slug" varchar,
  	"author_id" uuid,
  	"author_public_name" varchar,
  	"author_public_profile_key" varchar,
  	"author_public_avatar" varchar,
  	"author_public_department" varchar,
  	"author_public_position" varchar,
  	"author_public_is_pen_name" boolean,
  	"publication_type" "enum_articles_publication_type" DEFAULT 'COMMUNITY',
  	"verification_status" "enum_articles_verification_status" DEFAULT 'NOT_SUBMITTED',
  	"featured" boolean DEFAULT false,
  	"published_at" timestamp(3) with time zone,
  	"verified_at" timestamp(3) with time zone,
  	"verified_by_id" uuid,
  	"current_verified_version_id" uuid,
  	"active_verification_request_id" uuid,
  	"verified_content_hash" varchar,
  	"content_hash" varchar,
  	"view_count" numeric DEFAULT 0,
  	"search_text" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" uuid,
  	"tags_id" uuid
  );
  
  CREATE TABLE "_articles_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_title" varchar NOT NULL,
  	"version_subtitle" varchar,
  	"version_content" jsonb,
  	"version_featured_image_id" uuid,
  	"version_excerpt" varchar,
  	"version_publication_status" "enum__articles_v_version_publication_status" DEFAULT 'DRAFT' NOT NULL,
  	"version_visibility" "enum__articles_v_version_visibility" DEFAULT 'INTERNAL' NOT NULL,
  	"version_community_id" uuid,
  	"version_author_display" "enum__articles_v_version_author_display",
  	"version_allow_comments" boolean DEFAULT true,
  	"version_slug" varchar,
  	"version_author_id" uuid,
  	"version_author_public_name" varchar,
  	"version_author_public_profile_key" varchar,
  	"version_author_public_avatar" varchar,
  	"version_author_public_department" varchar,
  	"version_author_public_position" varchar,
  	"version_author_public_is_pen_name" boolean,
  	"version_publication_type" "enum__articles_v_version_publication_type" DEFAULT 'COMMUNITY',
  	"version_verification_status" "enum__articles_v_version_verification_status" DEFAULT 'NOT_SUBMITTED',
  	"version_featured" boolean DEFAULT false,
  	"version_published_at" timestamp(3) with time zone,
  	"version_verified_at" timestamp(3) with time zone,
  	"version_verified_by_id" uuid,
  	"version_current_verified_version_id" uuid,
  	"version_active_verification_request_id" uuid,
  	"version_verified_content_hash" varchar,
  	"version_content_hash" varchar,
  	"version_view_count" numeric DEFAULT 0,
  	"version_search_text" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" uuid,
  	"tags_id" uuid
  );
  
  CREATE TABLE "communities" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"cover_image_id" uuid,
  	"status" "enum_communities_status" DEFAULT 'ACTIVE',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "communities_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid
  );
  
  CREATE TABLE "tags" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"alt" varchar,
  	"caption" varchar,
  	"media_type" "enum_media_media_type" DEFAULT 'IMAGE',
  	"uploaded_by_id" uuid,
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_hero_url" varchar,
  	"sizes_hero_width" numeric,
  	"sizes_hero_height" numeric,
  	"sizes_hero_mime_type" varchar,
  	"sizes_hero_filesize" numeric,
  	"sizes_hero_filename" varchar
  );
  
  CREATE TABLE "comments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"article_id" uuid NOT NULL,
  	"content" varchar NOT NULL,
  	"parent_comment_id" uuid,
  	"status" "enum_comments_status" DEFAULT 'VISIBLE',
  	"author_id" uuid,
  	"author_display" "enum_comments_author_display",
  	"author_public_name" varchar,
  	"author_public_profile_key" varchar,
  	"author_public_avatar" varchar,
  	"author_public_department" varchar,
  	"author_public_position" varchar,
  	"author_public_is_pen_name" boolean,
  	"report_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid
  );
  
  CREATE TABLE "verification_requests" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"title" varchar,
  	"article_id" uuid NOT NULL,
  	"article_version" varchar,
  	"snapshot_title" varchar,
  	"snapshot_subtitle" varchar,
  	"snapshot_content" jsonb,
  	"snapshot_content_hash" varchar,
  	"snapshot_captured_at" timestamp(3) with time zone,
  	"community_id" uuid NOT NULL,
  	"requested_by_id" uuid NOT NULL,
  	"assigned_reviewer_id" uuid,
  	"assigned_approver_id" uuid,
  	"status" "enum_verification_requests_status" DEFAULT 'PENDING' NOT NULL,
  	"reviewer_recommendation" "enum_verification_requests_reviewer_recommendation",
  	"decision_note" varchar,
  	"previous_request_id" uuid,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "verification_reviews" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"verification_request_id" uuid NOT NULL,
  	"reviewer_id" uuid NOT NULL,
  	"role" "enum_verification_reviews_role",
  	"decision" "enum_verification_reviews_decision" NOT NULL,
  	"review_comment" varchar,
  	"reviewed_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "verification_history" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"article_id" uuid NOT NULL,
  	"article_version" varchar,
  	"verification_request_id" uuid,
  	"previous_status" varchar,
  	"new_status" varchar NOT NULL,
  	"action_by_id" uuid,
  	"action_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "notifications" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"recipient_id" uuid NOT NULL,
  	"title" varchar NOT NULL,
  	"message" varchar,
  	"notification_type" "enum_notifications_notification_type",
  	"related_article_id" uuid,
  	"read_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "bookmarks" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"user_id" uuid NOT NULL,
  	"article_id" uuid NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "audit_logs" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"actor_id" uuid,
  	"action" varchar NOT NULL,
  	"entity_type" varchar NOT NULL,
  	"entity_id" varchar,
  	"metadata" jsonb,
  	"timestamp" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_global_roles" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_users_global_roles",
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar NOT NULL,
  	"employee_id" varchar,
  	"department" varchar,
  	"position" varchar,
  	"show_department" boolean DEFAULT false,
  	"avatar_id" uuid,
  	"bio" varchar,
  	"display_name" varchar,
  	"pen_name" varchar,
  	"display_mode" "enum_users_display_mode" DEFAULT 'REAL_NAME',
  	"status" "enum_users_status" DEFAULT 'ACTIVE',
  	"public_key" varchar,
  	"pen_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_kv" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"articles_id" uuid,
  	"communities_id" uuid,
  	"tags_id" uuid,
  	"media_id" uuid,
  	"comments_id" uuid,
  	"verification_requests_id" uuid,
  	"verification_reviews_id" uuid,
  	"verification_history_id" uuid,
  	"notifications_id" uuid,
  	"bookmarks_id" uuid,
  	"audit_logs_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" uuid
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "articles" ADD CONSTRAINT "articles_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_current_verified_version_id_verification_requests_id_fk" FOREIGN KEY ("current_verified_version_id") REFERENCES "public"."verification_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_active_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("active_verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_community_id_communities_id_fk" FOREIGN KEY ("version_community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_verified_by_id_users_id_fk" FOREIGN KEY ("version_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_current_verified_version_id_verification_requests_id_fk" FOREIGN KEY ("version_current_verified_version_id") REFERENCES "public"."verification_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_active_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("version_active_verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "communities" ADD CONSTRAINT "communities_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "communities_rels" ADD CONSTRAINT "communities_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "communities_rels" ADD CONSTRAINT "communities_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments_rels" ADD CONSTRAINT "comments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments_rels" ADD CONSTRAINT "comments_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_assigned_reviewer_id_users_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_assigned_approver_id_users_id_fk" FOREIGN KEY ("assigned_approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_previous_request_id_verification_requests_id_fk" FOREIGN KEY ("previous_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_verification_request_id_verification_requests_id_fk" FOREIGN KEY ("verification_request_id") REFERENCES "public"."verification_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_action_by_id_users_id_fk" FOREIGN KEY ("action_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_article_id_articles_id_fk" FOREIGN KEY ("related_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_global_roles" ADD CONSTRAINT "users_global_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_communities_fk" FOREIGN KEY ("communities_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_verification_requests_fk" FOREIGN KEY ("verification_requests_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_verification_reviews_fk" FOREIGN KEY ("verification_reviews_id") REFERENCES "public"."verification_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_verification_history_fk" FOREIGN KEY ("verification_history_id") REFERENCES "public"."verification_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bookmarks_fk" FOREIGN KEY ("bookmarks_id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_logs_fk" FOREIGN KEY ("audit_logs_id") REFERENCES "public"."audit_logs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_featured_image_idx" ON "articles" USING btree ("featured_image_id");
  CREATE INDEX "articles_publication_status_idx" ON "articles" USING btree ("publication_status");
  CREATE INDEX "articles_visibility_idx" ON "articles" USING btree ("visibility");
  CREATE INDEX "articles_community_idx" ON "articles" USING btree ("community_id");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE INDEX "articles_author_idx" ON "articles" USING btree ("author_id");
  CREATE INDEX "articles_author_public_author_public_profile_key_idx" ON "articles" USING btree ("author_public_profile_key");
  CREATE INDEX "articles_verification_status_idx" ON "articles" USING btree ("verification_status");
  CREATE INDEX "articles_featured_idx" ON "articles" USING btree ("featured");
  CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");
  CREATE INDEX "articles_verified_by_idx" ON "articles" USING btree ("verified_by_id");
  CREATE INDEX "articles_current_verified_version_idx" ON "articles" USING btree ("current_verified_version_id");
  CREATE INDEX "articles_active_verification_request_idx" ON "articles" USING btree ("active_verification_request_id");
  CREATE INDEX "articles_view_count_idx" ON "articles" USING btree ("view_count");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_media_id_idx" ON "articles_rels" USING btree ("media_id");
  CREATE INDEX "articles_rels_tags_id_idx" ON "articles_rels" USING btree ("tags_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_featured_image_idx" ON "_articles_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_articles_v_version_version_publication_status_idx" ON "_articles_v" USING btree ("version_publication_status");
  CREATE INDEX "_articles_v_version_version_visibility_idx" ON "_articles_v" USING btree ("version_visibility");
  CREATE INDEX "_articles_v_version_version_community_idx" ON "_articles_v" USING btree ("version_community_id");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v" USING btree ("version_slug");
  CREATE INDEX "_articles_v_version_version_author_idx" ON "_articles_v" USING btree ("version_author_id");
  CREATE INDEX "_articles_v_version_author_public_version_author_public__idx" ON "_articles_v" USING btree ("version_author_public_profile_key");
  CREATE INDEX "_articles_v_version_version_verification_status_idx" ON "_articles_v" USING btree ("version_verification_status");
  CREATE INDEX "_articles_v_version_version_featured_idx" ON "_articles_v" USING btree ("version_featured");
  CREATE INDEX "_articles_v_version_version_published_at_idx" ON "_articles_v" USING btree ("version_published_at");
  CREATE INDEX "_articles_v_version_version_verified_by_idx" ON "_articles_v" USING btree ("version_verified_by_id");
  CREATE INDEX "_articles_v_version_version_current_verified_version_idx" ON "_articles_v" USING btree ("version_current_verified_version_id");
  CREATE INDEX "_articles_v_version_version_active_verification_request_idx" ON "_articles_v" USING btree ("version_active_verification_request_id");
  CREATE INDEX "_articles_v_version_version_view_count_idx" ON "_articles_v" USING btree ("version_view_count");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_media_id_idx" ON "_articles_v_rels" USING btree ("media_id");
  CREATE INDEX "_articles_v_rels_tags_id_idx" ON "_articles_v_rels" USING btree ("tags_id");
  CREATE UNIQUE INDEX "communities_slug_idx" ON "communities" USING btree ("slug");
  CREATE INDEX "communities_cover_image_idx" ON "communities" USING btree ("cover_image_id");
  CREATE INDEX "communities_updated_at_idx" ON "communities" USING btree ("updated_at");
  CREATE INDEX "communities_created_at_idx" ON "communities" USING btree ("created_at");
  CREATE INDEX "communities_rels_order_idx" ON "communities_rels" USING btree ("order");
  CREATE INDEX "communities_rels_parent_idx" ON "communities_rels" USING btree ("parent_id");
  CREATE INDEX "communities_rels_path_idx" ON "communities_rels" USING btree ("path");
  CREATE INDEX "communities_rels_users_id_idx" ON "communities_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "tags_name_idx" ON "tags" USING btree ("name");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE INDEX "media_media_type_idx" ON "media" USING btree ("media_type");
  CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_hero_sizes_hero_filename_idx" ON "media" USING btree ("sizes_hero_filename");
  CREATE INDEX "comments_article_idx" ON "comments" USING btree ("article_id");
  CREATE INDEX "comments_parent_comment_idx" ON "comments" USING btree ("parent_comment_id");
  CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status");
  CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");
  CREATE INDEX "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");
  CREATE INDEX "comments_rels_order_idx" ON "comments_rels" USING btree ("order");
  CREATE INDEX "comments_rels_parent_idx" ON "comments_rels" USING btree ("parent_id");
  CREATE INDEX "comments_rels_path_idx" ON "comments_rels" USING btree ("path");
  CREATE INDEX "comments_rels_users_id_idx" ON "comments_rels" USING btree ("users_id");
  CREATE INDEX "verification_requests_article_idx" ON "verification_requests" USING btree ("article_id");
  CREATE INDEX "verification_requests_community_idx" ON "verification_requests" USING btree ("community_id");
  CREATE INDEX "verification_requests_requested_by_idx" ON "verification_requests" USING btree ("requested_by_id");
  CREATE INDEX "verification_requests_assigned_reviewer_idx" ON "verification_requests" USING btree ("assigned_reviewer_id");
  CREATE INDEX "verification_requests_assigned_approver_idx" ON "verification_requests" USING btree ("assigned_approver_id");
  CREATE INDEX "verification_requests_status_idx" ON "verification_requests" USING btree ("status");
  CREATE INDEX "verification_requests_previous_request_idx" ON "verification_requests" USING btree ("previous_request_id");
  CREATE INDEX "verification_requests_updated_at_idx" ON "verification_requests" USING btree ("updated_at");
  CREATE INDEX "verification_requests_created_at_idx" ON "verification_requests" USING btree ("created_at");
  CREATE INDEX "verification_reviews_verification_request_idx" ON "verification_reviews" USING btree ("verification_request_id");
  CREATE INDEX "verification_reviews_reviewer_idx" ON "verification_reviews" USING btree ("reviewer_id");
  CREATE INDEX "verification_reviews_updated_at_idx" ON "verification_reviews" USING btree ("updated_at");
  CREATE INDEX "verification_reviews_created_at_idx" ON "verification_reviews" USING btree ("created_at");
  CREATE INDEX "verification_history_article_idx" ON "verification_history" USING btree ("article_id");
  CREATE INDEX "verification_history_verification_request_idx" ON "verification_history" USING btree ("verification_request_id");
  CREATE INDEX "verification_history_action_by_idx" ON "verification_history" USING btree ("action_by_id");
  CREATE INDEX "verification_history_updated_at_idx" ON "verification_history" USING btree ("updated_at");
  CREATE INDEX "verification_history_created_at_idx" ON "verification_history" USING btree ("created_at");
  CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");
  CREATE INDEX "notifications_related_article_idx" ON "notifications" USING btree ("related_article_id");
  CREATE INDEX "notifications_read_at_idx" ON "notifications" USING btree ("read_at");
  CREATE INDEX "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX "bookmarks_user_idx" ON "bookmarks" USING btree ("user_id");
  CREATE INDEX "bookmarks_article_idx" ON "bookmarks" USING btree ("article_id");
  CREATE INDEX "bookmarks_updated_at_idx" ON "bookmarks" USING btree ("updated_at");
  CREATE INDEX "bookmarks_created_at_idx" ON "bookmarks" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_article_idx" ON "bookmarks" USING btree ("user_id","article_id");
  CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");
  CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");
  CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs" USING btree ("entity_type");
  CREATE INDEX "audit_logs_entity_id_idx" ON "audit_logs" USING btree ("entity_id");
  CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");
  CREATE INDEX "audit_logs_updated_at_idx" ON "audit_logs" USING btree ("updated_at");
  CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
  CREATE INDEX "users_global_roles_order_idx" ON "users_global_roles" USING btree ("order");
  CREATE INDEX "users_global_roles_parent_idx" ON "users_global_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_employee_id_idx" ON "users" USING btree ("employee_id");
  CREATE INDEX "users_avatar_idx" ON "users" USING btree ("avatar_id");
  CREATE UNIQUE INDEX "users_public_key_idx" ON "users" USING btree ("public_key");
  CREATE UNIQUE INDEX "users_pen_key_idx" ON "users" USING btree ("pen_key");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_communities_id_idx" ON "payload_locked_documents_rels" USING btree ("communities_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX "payload_locked_documents_rels_verification_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("verification_requests_id");
  CREATE INDEX "payload_locked_documents_rels_verification_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("verification_reviews_id");
  CREATE INDEX "payload_locked_documents_rels_verification_history_id_idx" ON "payload_locked_documents_rels" USING btree ("verification_history_id");
  CREATE INDEX "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX "payload_locked_documents_rels_bookmarks_id_idx" ON "payload_locked_documents_rels" USING btree ("bookmarks_id");
  CREATE INDEX "payload_locked_documents_rels_audit_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_logs_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "communities" CASCADE;
  DROP TABLE "communities_rels" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "comments_rels" CASCADE;
  DROP TABLE "verification_requests" CASCADE;
  DROP TABLE "verification_reviews" CASCADE;
  DROP TABLE "verification_history" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "bookmarks" CASCADE;
  DROP TABLE "audit_logs" CASCADE;
  DROP TABLE "users_global_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_articles_publication_status";
  DROP TYPE "public"."enum_articles_visibility";
  DROP TYPE "public"."enum_articles_author_display";
  DROP TYPE "public"."enum_articles_publication_type";
  DROP TYPE "public"."enum_articles_verification_status";
  DROP TYPE "public"."enum__articles_v_version_publication_status";
  DROP TYPE "public"."enum__articles_v_version_visibility";
  DROP TYPE "public"."enum__articles_v_version_author_display";
  DROP TYPE "public"."enum__articles_v_version_publication_type";
  DROP TYPE "public"."enum__articles_v_version_verification_status";
  DROP TYPE "public"."enum_communities_status";
  DROP TYPE "public"."enum_media_media_type";
  DROP TYPE "public"."enum_comments_status";
  DROP TYPE "public"."enum_comments_author_display";
  DROP TYPE "public"."enum_verification_requests_status";
  DROP TYPE "public"."enum_verification_requests_reviewer_recommendation";
  DROP TYPE "public"."enum_verification_reviews_role";
  DROP TYPE "public"."enum_verification_reviews_decision";
  DROP TYPE "public"."enum_notifications_notification_type";
  DROP TYPE "public"."enum_users_global_roles";
  DROP TYPE "public"."enum_users_display_mode";
  DROP TYPE "public"."enum_users_status";`)
}
