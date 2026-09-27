-- A fallback that left both checks on one maker is stored here. It does not change pay or refuse.
ALTER TABLE "adjudications" ADD COLUMN "same_maker" BOOLEAN NOT NULL DEFAULT false;
