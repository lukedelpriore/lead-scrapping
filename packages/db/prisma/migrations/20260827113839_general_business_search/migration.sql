-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "business_type" TEXT,
ADD COLUMN     "command" TEXT,
ADD COLUMN     "keywords" JSONB;
