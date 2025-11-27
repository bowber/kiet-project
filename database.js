const mysql = require('mysql2/promise');

// --- CẤU HÌNH KẾT NỐI ---
// Sử dụng biến môi trường cho Docker, fallback về giá trị mặc định cho development
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',      
    user: process.env.DB_USER || 'root',           
    password: process.env.DB_PASSWORD || process.env.DB_ROOT_PASSWORD || 'L@m0981985353',          
    database: process.env.DB_NAME || 'ocpp_csms'   
};

let pool;

async function initDb() {
    try {
        // Tạo một connection pool để quản lý kết nối hiệu quả
        pool = mysql.createPool(dbConfig);

        // Kiểm tra kết nối
        const connection = await pool.getConnection();
        console.log('[Database] Kết nối MySQL thành công.');
        connection.release();

        // Tạo các bảng nếu chúng chưa tồn tại
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS charge_points (
                id VARCHAR(255) PRIMARY KEY,
                vendor VARCHAR(255),
                model VARCHAR(255),
                last_seen DATETIME
            );
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT PRIMARY KEY,
                charge_point_id VARCHAR(255),
                start_time DATETIME,
                stop_time DATETIME,
                meter_start INT,
                meter_stop INT,
                id_tag VARCHAR(255),
                FOREIGN KEY (charge_point_id) REFERENCES charge_points(id)
            );
        `);
        console.log('[Database] Các bảng đã được khởi tạo thành công.');
    } catch (err) {
        console.error('[Database] Lỗi khởi tạo MySQL:', err.message);
        console.log('[Database] Vui lòng kiểm tra lại thông tin kết nối trong database.js và đảm bảo MySQL server đang chạy.');
        // Dừng server nếu không kết nối được database
        process.exit(1); 
    }
}

async function updateChargePoint(id, vendor, model) {
    if (!pool) return;
    try {
        const sql = `
            INSERT INTO charge_points (id, vendor, model, last_seen) 
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                vendor = VALUES(vendor), 
                model = VALUES(model), 
                last_seen = VALUES(last_seen);
        `;
        await pool.execute(sql, [id, vendor, model, new Date()]);
    } catch (err) {
        console.error(`[Database] Lỗi khi cập nhật trạm sạc ${id}:`, err);
    }
}

async function recordHeartbeat(id) {
    if (!pool) return;
    try {
        const sql = 'UPDATE charge_points SET last_seen = ? WHERE id = ?';
        await pool.execute(sql, [new Date(), id]);
    } catch (err) {
        console.error(`[Database] Lỗi khi ghi nhận Heartbeat cho ${id}:`, err);
    }
}

async function startTransaction(chargePointId, transactionId, idTag, meterStart) {
    if (!pool) return;
    try {
        const sql = 'INSERT INTO transactions (id, charge_point_id, start_time, meter_start, id_tag) VALUES (?, ?, ?, ?, ?)';
        await pool.execute(sql, [transactionId, chargePointId, new Date(), meterStart, idTag]);
        console.log(`[Database] Bắt đầu giao dịch ${transactionId} cho trạm ${chargePointId}.`);
    } catch (err) {
        console.error(`[Database] Lỗi khi bắt đầu giao dịch ${transactionId}:`, err);
    }
}

async function stopTransaction(transactionId, meterStop) {
    if (!pool) return;
    try {
        const sql = 'UPDATE transactions SET stop_time = ?, meter_stop = ? WHERE id = ?';
        await pool.execute(sql, [new Date(), meterStop, transactionId]);
        console.log(`[Database] Kết thúc giao dịch ${transactionId}.`);
    } catch (err) {
        console.error(`[Database] Lỗi khi kết thúc giao dịch ${transactionId}:`, err);
    }
}

// Hàm lấy lịch sử giao dịch để hiển thị lên Dashboard
async function getRecentTransactions() {
    if (!pool) return [];
    try {
        // Lấy 50 giao dịch gần nhất, sắp xếp mới nhất lên đầu
        const sql = `
            SELECT t.id, t.charge_point_id, t.id_tag, 
                   t.start_time, t.stop_time, 
                   t.meter_start, t.meter_stop,
                   (t.meter_stop - t.meter_start) as total_energy
            FROM transactions t
            ORDER BY t.start_time DESC 
            LIMIT 50
        `;
        const [rows] = await pool.execute(sql);
        return rows;
    } catch (err) {
        console.error('[Database] Lỗi lấy dữ liệu transactions:', err);
        return [];
    }
}

module.exports = {
    initDb,
    updateChargePoint,
    recordHeartbeat,
    startTransaction,
    stopTransaction,
    getRecentTransactions
};
