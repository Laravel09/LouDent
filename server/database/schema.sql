-- LouDent Phase 2: MariaDB database (local development).
-- Run this entire file in the MariaDB/HeidiSQL query editor.
CREATE DATABASE IF NOT EXISTS loudent CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE loudent;
CREATE TABLE IF NOT EXISTS dentists (
 id VARCHAR(40) NOT NULL PRIMARY KEY,
 name VARCHAR(150) NOT NULL,
 title VARCHAR(80) NOT NULL DEFAULT '',
 specialty VARCHAR(160) NOT NULL DEFAULT '',
 experience_years SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 bio TEXT NOT NULL,
 photo_url MEDIUMTEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS services (
 id VARCHAR(80) NOT NULL PRIMARY KEY,
 name VARCHAR(180) NOT NULL,
 category VARCHAR(80) NOT NULL,
 duration_minutes SMALLINT UNSIGNED NOT NULL,
 price DECIMAL(10,2) NOT NULL,
 icon VARCHAR(30) NULL,
 description TEXT NOT NULL,
 preparation TEXT NOT NULL,
 involves_json TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dentist_services (
 dentist_id VARCHAR(40) NOT NULL,
 service_id VARCHAR(80) NOT NULL,
 PRIMARY KEY (dentist_id,service_id),
 FOREIGN KEY (dentist_id) REFERENCES dentists(id) ON DELETE CASCADE,
 FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) NOT NULL PRIMARY KEY,
 role ENUM('patient','dentist') NOT NULL,
 dentist_id VARCHAR(40) NULL,
 full_name VARCHAR(150) NOT NULL,
 email VARCHAR(254) NOT NULL UNIQUE,
 phone VARCHAR(40) NULL,
 email_verified_at DATETIME NULL,
 password_salt VARCHAR(80) NOT NULL,
 password_hash VARCHAR(160) NOT NULL,
 photo_data_url MEDIUMTEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (dentist_id) REFERENCES dentists(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) NOT NULL PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 expires_at DATETIME NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_sessions_user (user_id),
 KEY idx_sessions_expiry (expires_at),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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
CREATE TABLE IF NOT EXISTS weekly_availability (
 dentist_id VARCHAR(40) NOT NULL,
 day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Monday ... 6=Sunday',
 available BOOLEAN NOT NULL DEFAULT FALSE,
 start_time TIME NOT NULL,
 end_time TIME NOT NULL,
 break_start TIME NULL,
 break_end TIME NULL,
 PRIMARY KEY (dentist_id,day_of_week),
 FOREIGN KEY (dentist_id) REFERENCES dentists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS blocked_dates (
 dentist_id VARCHAR(40) NOT NULL,
 block_date DATE NOT NULL,
 PRIMARY KEY(dentist_id,block_date),
 FOREIGN KEY (dentist_id) REFERENCES dentists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS appointments (
 id CHAR(36) NOT NULL PRIMARY KEY,
 reference VARCHAR(35) NOT NULL UNIQUE,
 patient_id CHAR(36) NOT NULL,
 dentist_id VARCHAR(40) NOT NULL,
 service_id VARCHAR(80) NOT NULL,
 appointment_date DATE NOT NULL,
 start_time TIME NOT NULL,
 duration_minutes SMALLINT UNSIGNED NOT NULL,
 price DECIMAL(10,2) NOT NULL,
 status ENUM('Pending','Confirmed','Completed','Cancelled','Declined') NOT NULL DEFAULT 'Pending',
 decline_reason VARCHAR(500) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_slot (dentist_id,appointment_date,status,start_time),
 INDEX idx_patient (patient_id,appointment_date),
 FOREIGN KEY (patient_id) REFERENCES users(id),
 FOREIGN KEY (dentist_id) REFERENCES dentists(id),
 FOREIGN KEY (service_id) REFERENCES services(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
