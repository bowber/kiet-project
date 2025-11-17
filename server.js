const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const db = require('./database.js');
const os = require('os');
const {
    OPCUAServer,
    DataType,
    Variant,
    StatusCodes,
    AddressSpace,
    NodeClass
} = require("node-opcua");

// --- BỘ QUẢN LÝ TRẠNG THÁI ---
const clients = {
    chargePoints: new Map(),
    dashboards: new Set()
};
const opcUaCreationLocks = new Set();

let opcUaServer;
let opcUaAddressSpace;

// --- HÀM TRUYỀN TIN ---
function broadcastToDashboards(message) {
    const serializedMessage = JSON.stringify(message);
    clients.dashboards.forEach(dashboard => {
        if (dashboard.readyState === WebSocket.OPEN) {
            dashboard.send(serializedMessage);
        }
    });
}

// Hàm helper để cập nhật giá trị 1 tag OPC UA
function updateOpcuaTag(chargePointId, tagName, value) {
    const cp = clients.chargePoints.get(chargePointId);
    if (cp && cp.opcuaNodes && cp.opcuaNodes[tagName]) {
        try {
            const node = cp.opcuaNodes[tagName];
            node.setValueFromSource(new Variant({ dataType: node.dataTypeObj.dataType, value: value }));
        } catch (err) {
            console.error(`[OPC UA] Lỗi khi cập nhật tag ${tagName} cho ${chargePointId}:`, err);
        }
    }
}

function createOpcUaNodesForChargePoint(chargePointId) {
    const namespace = opcUaAddressSpace.getOwnNamespace();
    const chargePointsFolder = opcUaAddressSpace.findNode("ns=1;s=ChargePointsFolder");

    if (!chargePointsFolder) {
        console.error("[OPC UA] Lỗi nghiêm trọng: Không tìm thấy 'ChargePointsFolder'.");
        return;
    }

    let chargePointFolder = chargePointsFolder.getChildByName(chargePointId);
    const nodes = {};

    if (!chargePointFolder) {
        // --- Tạo mới mọi thứ ---
        console.log(`[OPC UA] Đang tạo thư mục mới cho ${chargePointId}`);
        chargePointFolder = namespace.addFolder(chargePointsFolder, {
            browseName: chargePointId
        });

        // Tạo các node con (chỉ tạo khi thư mục mới)
        nodes.Status = namespace.addVariable({ componentOf: chargePointFolder, browseName: "Status", dataType: DataType.String, value: { dataType: DataType.String, value: "Connecting" } });
        nodes.Energy_Wh = namespace.addVariable({ componentOf: chargePointFolder, browseName: "Energy_Wh", dataType: DataType.Double, value: { dataType: DataType.Double, value: 0 } });
        nodes.TransactionID = namespace.addVariable({ componentOf: chargePointFolder, browseName: "TransactionID", dataType: DataType.Int32, value: { dataType: DataType.Int32, value: 0 } });
        nodes.Vendor = namespace.addVariable({ componentOf: chargePointFolder, browseName: "Vendor", dataType: DataType.String, value: { dataType: DataType.String, value: "" } });
        nodes.Model = namespace.addVariable({ componentOf: chargePointFolder, browseName: "Model", dataType: DataType.String, value: { dataType: DataType.String, value: "" } });
        nodes.RemoteStartTrigger = namespace.addVariable({ componentOf: chargePointFolder, browseName: "RemoteStart_Trigger", dataType: DataType.Boolean, value: { dataType: DataType.Boolean, value: false }, accessLevel: "CurrentRead | CurrentWrite", userAccessLevel: "CurrentRead | CurrentWrite" });
        nodes.RemoteStart_IdTag = namespace.addVariable({ componentOf: chargePointFolder, browseName: "RemoteStart_IdTag", dataType: DataType.String, value: { dataType: DataType.String, value: "0000" }, accessLevel: "CurrentRead | CurrentWrite", userAccessLevel: "CurrentRead | CurrentWrite" });
        nodes.RemoteStopTrigger = namespace.addVariable({ componentOf: chargePointFolder, browseName: "RemoteStop_Trigger", dataType: DataType.Boolean, value: { dataType: DataType.Boolean, value: false }, accessLevel: "CurrentRead | CurrentWrite", userAccessLevel: "CurrentRead | CurrentWrite" });
    
    } else {
        // --- Lấy lại các node cũ ---
        console.log(`[OPC UA] Đã tìm thấy thư mục ${chargePointId}, đang sử dụng lại.`);
        nodes.Status = chargePointFolder.getChildByName("Status");
        nodes.Energy_Wh = chargePointFolder.getChildByName("Energy_Wh");
        nodes.TransactionID = chargePointFolder.getChildByName("TransactionID");
        nodes.Vendor = chargePointFolder.getChildByName("Vendor");
        nodes.Model = chargePointFolder.getChildByName("Model");
        nodes.RemoteStartTrigger = chargePointFolder.getChildByName("RemoteStart_Trigger");
        nodes.RemoteStart_IdTag = chargePointFolder.getChildByName("RemoteStart_IdTag");
        nodes.RemoteStopTrigger = chargePointFolder.getChildByName("RemoteStop_Trigger");
    }

    if (!nodes.RemoteStartTrigger || !nodes.RemoteStopTrigger || !nodes.RemoteStart_IdTag) {
        console.error(`[OPC UA] Lỗi: Không thể tìm thấy các node trigger cho ${chargePointId}. Hủy bỏ binding.`);
        return nodes; 
    }

    try {
        // --- 1. START TRIGGER ---
        nodes.RemoteStartTrigger.bindVariable({     
            get: function() {
                return new Variant({ dataType: DataType.Boolean, value: false });
            },
            set: (variant, callback) => {
                const value = variant.value;
                if (value == true) { 
                    console.log(`[OPC UA] Nhận lệnh RemoteStart cho ${chargePointId}`);
                    try {
                        const dataValue = nodes.RemoteStart_IdTag.readValue();
                        const idTag = (dataValue.value && dataValue.value.value) ? dataValue.value.value : "0000";
                        
                        const targetCP = clients.chargePoints.get(chargePointId);
                        if (targetCP && targetCP.ws.readyState === WebSocket.OPEN) {
                            const uniqueId = uuidv4();
                            const ocppMessage = [2, uniqueId, "RemoteStartTransaction", { idTag: idTag, connectorId: 1 }];
                            targetCP.ws.send(JSON.stringify(ocppMessage));
                        }
                    } catch (err) {
                        console.error("[OPC UA] Lỗi khi đọc IdTag hoặc gửi lệnh Start:", err.message);
                    }
                    nodes.RemoteStartTrigger.setValueFromSource(new Variant({ dataType: DataType.Boolean, value: false }));
                }
                callback(null, StatusCodes.Good);
            }
        }, true); 

        // --- 2. STOP TRIGGER ---
        nodes.RemoteStopTrigger.bindVariable({    
            get: function() {
                return new Variant({ dataType: DataType.Boolean, value: false });
            },
            set: (variant, callback) => {
                const value = variant.value;
                if (value == true) { 
                    console.log(`[OPC UA] Nhận lệnh RemoteStop cho ${chargePointId}`);
                    try {
                        const targetCP = clients.chargePoints.get(chargePointId);
                        const state = targetCP ? targetCP.state : null;
                        if (state && state.transactionId && targetCP.ws.readyState === WebSocket.OPEN) {
                            const uniqueId = uuidv4();
                            const ocppMessage = [2, uniqueId, "RemoteStopTransaction", { transactionId: state.transactionId }];
                            targetCP.ws.send(JSON.stringify(ocppMessage));
                        }
                    } catch (err) {
                        console.error("[OPC UA] Lỗi khi gửi lệnh Stop:", err.message);
                    }
                    nodes.RemoteStopTrigger.setValueFromSource(new Variant({ dataType: DataType.Boolean, value: false }));
                }
                callback(null, StatusCodes.Good);
            }
        }, true); 

        console.log(`[OPC UA] Binding cho ${chargePointId} thành công.`);

    } catch (err) {
        console.error(`[OPC UA] Lỗi không mong muốn khi binding ${chargePointId}: ${err.message}`);
    }
    
    return nodes;
}

// Hàm khởi tạo và cấu hình OPC UA Server
async function initializeOpcUaServer() {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let privateIp = null;
    let publicIp = null;

    for (const ifaceName in networkInterfaces) {
        const iface = networkInterfaces[ifaceName];
        if (!iface) continue;

        for (const alias of iface) {
            // Chỉ tìm IPv4 
            if (alias.family === 'IPv4' && !alias.internal) {
                
                // Lọc bỏ địa chỉ APIPA "rác"
                if (alias.address.startsWith('169.254.')) {
                    continue;
                }

                // Ưu tiên 1: Tìm địa chỉ LAN (Private)
                if (alias.address.startsWith('192.168.') || alias.address.startsWith('10.') || (alias.address.startsWith('172.') && parseInt(alias.address.split('.')[1], 10) >= 16 && parseInt(alias.address.split('.')[1], 10) <= 31)) {
                    privateIp = alias.address;
                    break; // Ngừng tìm trên card mạng này
                }

                // Ưu tiên 2: Lưu địa chỉ Public đầu tiên tìm thấy làm dự phòng
                if (!publicIp) {
                    publicIp = alias.address;
                }
            }
        }
        if (privateIp) break; // Đã tìm thấy IP private, ngừng tìm trên các card mạng khác
    }

    // Chọn IP theo thứ tự ưu tiên: Private > Public > Loopback
    const ipAddress = privateIp || publicIp || '127.0.0.1'; 
    console.log(`[OPC UA] Sử dụng địa chỉ IP: ${ipAddress}`);

    opcUaServer = new OPCUAServer({
        port: 4840, // Cổng OPC UA tiêu chuẩn
        resourcePath: "/UA/OcppCsmsServer",
        buildInfo: {
            productName: "OCPP CSMS Server",
            buildNumber: "1.0",
            buildDate: new Date()
        },
        alternateHostname: ipAddress,
        serverInfo: { applicationUri: `opc.tcp://${ipAddress}:4840/UA/OcppCsmsServer` }
    });

    await opcUaServer.initialize();

    // Lấy đối tượng addressSpace để thêm các biến
    opcUaAddressSpace = opcUaServer.engine.addressSpace;
    const objectsFolder = opcUaAddressSpace.findNode("i=85");
    // Tạo một thư mục gốc cho các trạm sạc
    opcUaAddressSpace.getOwnNamespace().addFolder(objectsFolder, {
        browseName: "ChargePoints",
        nodeId: "ns=1;s=ChargePointsFolder"
    });

    console.log("[OPC UA] Server đã được khởi tạo và sẵn sàng.");

    // Bắt đầu server
    await opcUaServer.start();
    console.log(`[OPC UA] Server đang lắng nghe trên cổng ${opcUaServer.endpoints[0].port}`);
    console.log(`[OPC UA] Endpoint URL: ${opcUaServer.endpoints[0].endpointDescriptions()[0].endpointUrl}`);
}

// --- HTTP SERVER ---
const server = http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];
    let filePath = path.join(__dirname, 'public', pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
        const ext = path.extname(filePath);
        const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(content);
    });
});

// --- WEBSOCKET SERVER ---
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    const urlParts = req.url.split('/');
    const id = urlParts.pop() || urlParts.pop();

    if (id === 'dashboard' || id === 'scada') {
        clients.dashboards.add(ws);
        console.log(`[Master] ${id.toUpperCase()} đã kết nối.`);
        ws.send(JSON.stringify({ type: 'fullStatus', chargePoints: Array.from(clients.chargePoints.values(), cp => cp.state) }));
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'remoteCommand') {
                    console.log(`[Master] Nhận lệnh từ dashboard:`, data);
                    const { command, chargePointId, params } = data;
                    const targetCP = clients.chargePoints.get(chargePointId);

                    if (targetCP && targetCP.ws.readyState === WebSocket.OPEN) {
                        const uniqueId = uuidv4();
                        const ocppMessage = [2, uniqueId, command, params || {}];
                        targetCP.ws.send(JSON.stringify(ocppMessage));
                        console.log(`[Master] Đã gửi lệnh ${command} tới ${chargePointId}`);
                        
                        broadcastToDashboards({
                            type: 'log',
                            direction: 'request',
                            chargePointId: 'CSMS_Dashboard',
                            message: [2, uniqueId, `(To ${chargePointId}) ${command}`, params || {}]
                        });

                    } else {
                        console.error(`[Master] Lỗi: Không tìm thấy hoặc không thể kết nối tới trạm ${chargePointId}`);
                    }
                }
            } catch (e) {
                console.error("Lỗi xử lý message từ dashboard:", e);
            }
        });

        ws.on('close', () => {
            clients.dashboards.delete(ws);
            console.log(`[Master] ${id.toUpperCase()} đã ngắt kết nối.`);
        });

    } else { // Kết nối từ trạm sạc
        const chargePointId = id;
        
        if (opcUaCreationLocks.has(chargePointId)) {
            console.warn(`[Master] Từ chối kết nối ${chargePointId} do đang tạo (race condition).`);
            ws.terminate();
            return;
        }

        if (clients.chargePoints.has(chargePointId)) {
            console.warn(`[Master] Trạm ${chargePointId} kết nối đè. Đang dọn dẹp kết nối cũ...`);
            const oldCp = clients.chargePoints.get(chargePointId);
            
            if (oldCp.ws) {
                oldCp.ws.terminate(); 
            }
            if (oldCp.python) {
                oldCp.python.kill();
            }
        }
            
        console.log(`[Master] Spawning Python handler for '${chargePointId}'...`);
        const pythonHandler = spawn('python3', ['OCPP_handler.py']);

        const chargePointState = { id: chargePointId, vendor: '', model: '', status: 'Connecting', transactionId: null, energy: 0 };
        
        opcUaCreationLocks.add(chargePointId);
        const opcuaNodes = createOpcUaNodesForChargePoint(chargePointId);

        opcUaCreationLocks.delete(chargePointId);

        clients.chargePoints.set(chargePointId, { 
            ws: ws, 
            state: chargePointState, 
            python: pythonHandler, 
            opcuaNodes: opcuaNodes
        });
      
        console.log(`[Master] Client '${chargePointId}' đã kết nối.`);
        broadcastToDashboards({ type: 'connect', id: chargePointId, state: chargePointState });
    

        ws.on('message', (message) => {
            const currentCp = clients.chargePoints.get(chargePointId);
                if (!currentCp || currentCp.ws !== ws) {
                // Message này đến từ 1 socket cũ đã bị "đè". Bỏ qua.
                return; 
            }
            const messageString = message.toString();
            console.log(`[Master -> Python] Forwarding message from ${chargePointId}: ${messageString}`);
            
            try {
                const parsedMessage = JSON.parse(messageString);
                const [,, action, payload] = parsedMessage;

                if (action === 'BootNotification') {
                    chargePointState.vendor = payload.chargePointVendor;
                    chargePointState.model = payload.chargePointModel;
                    chargePointState.status = 'Available';
                    broadcastToDashboards({ type: 'boot', id: chargePointId, state: chargePointState });
                    updateOpcuaTag(chargePointId, "Vendor", chargePointState.vendor);
                    updateOpcuaTag(chargePointId, "Model", chargePointState.model);
                    updateOpcuaTag(chargePointId, "Status", chargePointState.status);
                } else if (action === 'StatusNotification') {
                    chargePointState.status = payload.status;
                    broadcastToDashboards({ type: 'status', id: chargePointId, status: chargePointState.status });
                    updateOpcuaTag(chargePointId, "Status", chargePointState.status);
                } else if (action === 'StopTransaction') {
                    chargePointState.transactionId = null;
                    chargePointState.energy = 0; // Reset energy khi dừng
                    broadcastToDashboards({ type: 'transactionStop', id: chargePointId, transactionId: null });
                    broadcastToDashboards({ type: 'meterValue', id: chargePointId, value: 0 }); // Gửi cập nhật energy về 0
                    updateOpcuaTag(chargePointId, "TransactionID", 0); // Đặt về 0 hoặc null
                    updateOpcuaTag(chargePointId, "Energy_Wh", 0);
                } 
                else if (action === 'MeterValues') {
                    const latestMeterValue = payload.meterValue[payload.meterValue.length - 1];
                    const energyValue = latestMeterValue.sampledValue[0].value;
                    chargePointState.energy = energyValue;
                    broadcastToDashboards({ type: 'meterValue', id: chargePointId, value: energyValue });
                    updateOpcuaTag(chargePointId, "Energy_Wh", parseFloat(energyValue) || 0);
                }

                broadcastToDashboards({ type: 'log', direction: 'request', chargePointId, message: parsedMessage });
            } catch (e) { /* Bỏ qua lỗi */ }

            if (clients.chargePoints.has(chargePointId)) {
                clients.chargePoints.get(chargePointId).python.stdin.write(messageString + '\n');
            }
        });
        
        let pythonBuffer = '';
        pythonHandler.stdout.on('data', (data) => {
            const currentCp = clients.chargePoints.get(chargePointId);
            if (!currentCp || currentCp.ws !== ws) {
                // Python handler này thuộc về 1 socket cũ. Bỏ qua.
                return;
            }
            pythonBuffer += data.toString();
            let newlineIndex;

            while ((newlineIndex = pythonBuffer.indexOf('\n')) !== -1) {
                const responseString = pythonBuffer.substring(0, newlineIndex).trim();
                pythonBuffer = pythonBuffer.substring(newlineIndex + 1);

                if (responseString) {
                    console.log(`[Python -> Master] Received response for ${chargePointId}: ${responseString}`);
                    ws.send(responseString);
                    
                    try {
                        const responseJson = JSON.parse(responseString);
                        broadcastToDashboards({ type: 'log', direction: 'response', chargePointId, message: responseJson });
                        
                        const [,, payload] = responseJson;
                        if (payload && payload.transactionId) {
                             if (chargePointState) {
                                 chargePointState.transactionId = payload.transactionId;
                                 chargePointState.energy = 0; // Reset energy khi bắt đầu
                                 broadcastToDashboards({ type: 'transactionStart', id: chargePointId, transactionId: chargePointState.transactionId });
                        
                                 updateOpcuaTag(chargePointId, "TransactionID", payload.transactionId);
                                 updateOpcuaTag(chargePointId, "Energy_Wh", 0);
                            }
                        }
                    } catch (e) {
                        console.error(`[Master] Error parsing JSON from Python for ${chargePointId}:`, e);
                    }
                }
            }
        });

        pythonHandler.stderr.on('data', (data) => {
            console.error(`[Python stderr for ${chargePointId}]: ${data.toString()}`);
        });

        pythonHandler.on('error', (err) => {
            console.error(`[Master] Failed to start Python process for ${chargePointId}:`, err);
            ws.close(1011, 'Internal server error');
        });

        pythonHandler.on('close', (code) => {
            console.log(`[Master] Python handler for ${chargePointId} exited with code ${code}`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.close(1012, 'Handler process terminated');
            }
        });

        ws.on('close', () => {
            const cp = clients.chargePoints.get(chargePointId);

            if (cp && cp.ws === ws) {
                if (cp.python) {
                    cp.python.kill();
                }

                if (cp.opcuaNodes) {
                    console.log(`[OPC UA] Cập nhật trạng thái 'Disconnected' cho ${chargePointId}`);
                    updateOpcuaTag(chargePointId, "Status", "Disconnected");
                }

                clients.chargePoints.delete(chargePointId);
                console.log(`[Master] Client '${chargePointId}' đã ngắt kết nối.`);
                broadcastToDashboards({ type: 'disconnect', id: chargePointId });
            } else {
                // Đây là 1 socket cũ, nó đã bị "đè" và dọn dẹp rồi.
                console.log(`[Master] Socket cũ của ${chargePointId} đã được dọn dẹp.`);
            }
        });
    }
});

function monitorOpcUaWrites(chargePointId, opcuaNodes) {
    
    // Theo dõi lệnh START
    opcuaNodes.RemoteStartTrigger.bindVariable({
        set: (variant, callback) => {
            const value = variant.value;
            if (value === true) {
                console.log(`[OPC UA] Nhận lệnh RemoteStart cho ${chargePointId}`);
                
                // Đọc IdTag mà WinCC đã nhập
                const idTag = opcuaNodes.RemoteStart_IdTag.readValue().value.value || "0000";

                // Tái sử dụng logic gửi lệnh từ dashboard
                const targetCP = clients.chargePoints.get(chargePointId);
                if (targetCP && targetCP.ws.readyState === WebSocket.OPEN) {
                    const uniqueId = uuidv4();
                    const ocppMessage = [2, uniqueId, "RemoteStartTransaction", { idTag: idTag, connectorId: 1 }];
                    targetCP.ws.send(JSON.stringify(ocppMessage));
                    console.log(`[Master] Đã gửi lệnh RemoteStartTransaction tới ${chargePointId} (từ OPC UA)`);
                }

                // Tự động reset trigger về false
                opcuaNodes.RemoteStartTrigger.setValueFromSource(new Variant({ dataType: DataType.Boolean, value: false }));
            }
            callback(null, StatusCodes.Good);
        }
    });

    // 2. Theo dõi lệnh STOP
    opcuaNodes.RemoteStopTrigger.bindVariable({
        set: (variant, callback) => {
            const value = variant.value;
            if (value === true) {
                console.log(`[OPC UA] Nhận lệnh RemoteStop cho ${chargePointId}`);
                
                const targetCP = clients.chargePoints.get(chargePointId);
                const state = targetCP ? targetCP.state : null;

                if (state && state.transactionId && targetCP.ws.readyState === WebSocket.OPEN) {
                    const uniqueId = uuidv4();
                    const ocppMessage = [2, uniqueId, "RemoteStopTransaction", { transactionId: state.transactionId }];
                    targetCP.ws.send(JSON.stringify(ocppMessage));
                    console.log(`[Master] Đã gửi lệnh RemoteStopTransaction tới ${chargePointId} (từ OPC UA)`);
                }
                
                // Tự động reset trigger về false
                opcuaNodes.RemoteStopTrigger.setValueFromSource(new Variant({ dataType: DataType.Boolean, value: false }));
            }
            callback(null, StatusCodes.Good);
        }
    });
}

// --- KHỞI ĐỘNG SERVER ---
async function startServer() {
    try {
        await db.initDb();
        await initializeOpcUaServer();
        const PORT = 9000;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`CSMS Master Server đang chạy trên cổng ${PORT}`);
        });
    } catch (error) {
        console.error("Không thể khởi động server do lỗi database:", error);
        process.exit(1);
    }
}

startServer();
