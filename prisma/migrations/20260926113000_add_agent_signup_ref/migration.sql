-- One nullable column. Existing workspaces stay null.
-- Adding a nullable text column does not rewrite rows or change any other table.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "signup_ref" TEXT;
