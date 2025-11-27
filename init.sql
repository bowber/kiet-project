-- Khởi tạo cơ sở dữ liệu OCPP CSMS
-- Script này sẽ tự động chạy khi MySQL container khởi động lần đầu

CREATE DATABASE IF NOT EXISTS ocpp_csms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE ocpp_csms;

-- Bảng quản lý các trạm sạc
CREATE TABLE IF NOT EXISTS charge_points (
    id VARCHAR(255) PRIMARY KEY,
    vendor VARCHAR(255),
    model VARCHAR(255),
    last_seen DATETIME,
    INDEX idx_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng quản lý các giao dịch sạc
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
    INDEX idx_start_time (start_time),
    INDEX idx_stop_time (stop_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tạo user mới với quyền hạn (nếu chưa tồn tại)
-- User này sẽ được sử dụng bởi ứng dụng thay vì root
CREATE USER IF NOT EXISTS 'ocpp_user'@'%' IDENTIFIED BY 'ocpp_pass';
GRANT ALL PRIVILEGES ON ocpp_csms.* TO 'ocpp_user'@'%';
FLUSH PRIVILEGES;

-- Dữ liệu mẫu (tùy chọn - có thể xóa nếu không cần)
-- INSERT INTO charge_points (id, vendor, model, last_seen) 
-- VALUES ('DEMO-CP-001', 'Demo Vendor', 'Demo Model', NOW());
