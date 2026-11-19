-- Migration 001 (idempotent: safe to run more than once; never deletes data)
--   * users.email_verified_at          - email verification state
--   * auth_tokens                      - hashed one-time tokens for email verification / password reset
--   * dentists.photo_url -> MEDIUMTEXT - dentist pictures (uploaded data URLs) live on the dentist PROFILE
--   * copies any picture previously stored on a dentist's login row onto the dentist profile, then clears the
--     legacy copy (so a later re-created staff login can never overwrite or resurrect a picture)
--   * staff (dentist) accounts count as verified (they are created by an administrator, not self-registered)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at DATETIME NULL AFTER phone;
CREATE TABLE IF NOT EXISTS auth_tokens (
 id CHAR(36) NOT NULL PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 purpose ENUM('password_reset','email_verify') NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at DATETIME NOT NULL,
 used_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_auth_tokens_user (user_id,purpose),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE dentists MODIFY COLUMN photo_url MEDIUMTEXT NULL;
UPDATE dentists d JOIN users u ON u.dentist_id=d.id SET d.photo_url=u.photo_data_url WHERE u.photo_data_url IS NOT NULL AND u.photo_data_url<>'';
UPDATE users SET photo_data_url=NULL WHERE role='dentist' AND photo_data_url IS NOT NULL;
UPDATE users SET email_verified_at=UTC_TIMESTAMP() WHERE role='dentist' AND email_verified_at IS NULL;
