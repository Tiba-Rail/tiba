CREATE TYPE "Rail" AS ENUM ('mock', 'sui');

ALTER TABLE "agents" ALTER COLUMN "rail" DROP DEFAULT;
ALTER TABLE "agents" ALTER COLUMN "rail" TYPE "Rail" USING "rail"::"Rail";
ALTER TABLE "agents" ALTER COLUMN "rail" SET DEFAULT 'mock';

