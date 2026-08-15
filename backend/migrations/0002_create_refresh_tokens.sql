-- Sessions persistantes : seul le hachage du refresh token est conservé.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  revokedAt TEXT,
  replacedByTokenId TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (replacedByTokenId) REFERENCES refresh_tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_userId ON refresh_tokens(userId);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiresAt ON refresh_tokens(expiresAt);
