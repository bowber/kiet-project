-- Khởi tạo hoặc cập nhật database
CREATE DATABASE IF NOT EXISTS ocpp_csms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ocpp_csms;

-- Bảng quản lý các trạm sạc (Thêm cột location và status)
CREATE TABLE IF NOT EXISTS charge_points (
    id VARCHAR(255) PRIMARY KEY,
    vendor VARCHAR(255),
    model VARCHAR(255),
    location VARCHAR(255), 
    status VARCHAR(50) DEFAULT 'Offline',
    last_seen DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng transactions giữ nguyên
CREATE TABLE IF NOT EXISTS transactions (
    id INT PRIMARY KEY,
    charge_point_id VARCHAR(255),
    start_time DATETIME,
    stop_time DATETIME,
    meter_start INT,
    meter_stop INT,
    id_tag VARCHAR(255),
    FOREIGN KEY (charge_point_id) REFERENCES charge_points(id) ON DELETE CASCADE,
    INDEX idx_charge_point (charge_point_id),
    INDEX idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;