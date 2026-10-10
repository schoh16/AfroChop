INSERT INTO "user_verifications"
  ("id", "userId", "type", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'email', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("userId", "type") DO NOTHING;

INSERT INTO "user_verifications"
  ("id", "userId", "type", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'phone', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("userId", "type") DO NOTHING;
