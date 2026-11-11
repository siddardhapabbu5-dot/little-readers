-- T-SEC-06: forgot-PIN codes are emailed with their own purpose (additive enum value).
ALTER TYPE "EmailOtpPurpose" ADD VALUE IF NOT EXISTS 'RESET_PIN';
