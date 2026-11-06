-- Additive only: extend VocabRound for Matching, Quiz, Revision.
-- Does not modify or delete existing learning data.
ALTER TYPE "VocabRound" ADD VALUE 'MATCHING';
ALTER TYPE "VocabRound" ADD VALUE 'QUIZ';
ALTER TYPE "VocabRound" ADD VALUE 'REVISION';
