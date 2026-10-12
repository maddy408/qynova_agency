-- Additive migration for POS previous-week selling price popup settings
-- Safe, re-runnable, additive only. Zero drops, zero deletes.

CREATE TABLE IF NOT EXISTS pos_feature_settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    branch_id INT UNSIGNED NOT NULL,
    pos_prev_week_popup_enabled TINYINT(1) NOT NULL DEFAULT 1,
    prev_week_price_rule ENUM('AUTO', 'LATEST', 'AVERAGE', 'MOST_USED') NOT NULL DEFAULT 'AUTO',
    prev_week_popup_on_repeat_add TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pos_settings_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
