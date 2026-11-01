-- Store refresh tokens hashed (SHA-256 hex) instead of in plain text. Existing sessions are
-- converted in place, so nobody is logged out. JWTs are 100+ chars; a 64-char hex value is
-- already a hash, which keeps this safe to re-run.
UPDATE "Session"
SET "refreshToken" = encode(sha256(convert_to("refreshToken", 'UTF8')), 'hex')
WHERE length("refreshToken") <> 64;
