CREATE TYPE "public"."kb_document_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"status" "kb_document_status" DEFAULT 'pending' NOT NULL,
	"error_summary" text,
	"chunk_count" integer,
	"content_hash" text NOT NULL,
	"ingestion_generation" integer DEFAULT 1 NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
