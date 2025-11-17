document.addEventListener('DOMContentLoaded', () => {
    const chargersContainer = document.getElementById('chargers-container');
    const chargePointCards = new Map();
    const globalLogBody = document.getElementById('global-log-body');
    const MAX_LOG_ROWS = 100;

    // Kiểm tra xem các phần tử cần thiết có tồn tại không
    if (!chargersContainer) {
        console.error('Error: Element with id "chargers-container" not found!');
        return;
    }
    if (!globalLogBody) {
        console.error('Error: Element with id "global-log-body" not found!');
        return;
    }

    let ws; 

    function sendRemoteCommand(command, chargePointId, params = {}) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const message = { type: 'remoteCommand', command, chargePointId, params };
            ws.send(JSON.stringify(message));
            console.log('Sent command:', message);
        } else {
            alert('Không thể gửi lệnh. Mất kết nối tới server.');
        }
    }

    function parseOcppMessage(logData) {
        const { direction, message, action: originalAction, chargePointId } = logData;
        const [msgType, msgId, actionOrPayload, payload] = message;

        if (direction === 'request' && chargePointId === 'CSMS_Dashboard') {
             return { action: actionOrPayload, payload: payload };
        }
        if (direction === 'request') return { action: actionOrPayload, payload };
        if (direction === 'response') return { action: originalAction || 'Response', payload: actionOrPayload };
        if (direction === 'info') return { action: 'Info', payload: { message: message[1] }};
        return { action: 'Unknown', payload: {} };
    }

    function addLogRow(data) {
        const { action, payload } = parseOcppMessage(data);
        const row = document.createElement('tr');
        const isRequest = data.direction === 'request';
        const directionClass = isRequest ? 'request' : 'response';
        const directionArrow = isRequest ? '➡️' : '⬅️';
        const directionText = data.chargePointId === 'CSMS_Dashboard' ? 'CSMS' : data.chargePointId;

        row.innerHTML = `
            <td>${new Date().toLocaleTimeString()}</td>
            <td class="direction-${directionClass}">${directionArrow} ${isRequest ? 'To' : 'From'}</td>
            <td>${directionText}</td>
            <td>${action}</td>
            <td class="payload-cell"><pre>${JSON.stringify(payload, null, 2)}</pre></td>
        `;
        
        if(data.direction === 'info') {
            row.classList.add('info-log');
            row.querySelector('td:nth-child(2)').textContent = 'ℹ️';
        }

        globalLogBody.prepend(row);
        if (globalLogBody.rows.length > MAX_LOG_ROWS) {
            globalLogBody.deleteRow(-1);
        }
    }

    class ChargePointCard {
        constructor(id, initialState) {
            this.id = id;
            this.state = { energy: 0, ...initialState };
            this.render();
            this.updateAll(initialState);
        }

        render() {
            this.element = document.createElement('div');
            this.element.className = 'charger-card';
            this.element.id = `charger-${this.id}`;
            this.element.innerHTML = `
                <div class="card-header">
                    <h3><i class="fa-solid fa-charging-station"></i> ${this.id}</h3>
                    <div class="header-icons">
                        <i class="fa-solid fa-heart-pulse heartbeat-icon"></i>
                        <div class="status-tag status-disconnected">
                            <span class="status-dot"></span>
                            <span class="status-text">Disconnected</span>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <p><strong>Vendor:</strong> <span class="vendor-info">N/A</span></p>
                    <p><strong>Model:</strong> <span class="model-info">N/A</span></p>
                    <p><strong>Transaction:</strong> <span class="transaction-info">None</span></p>
                    <p><strong>Energy:</strong> <span class="energy-info">0 kWh</span></p>
                </div>
                <div class="card-actions">
                     <button class="action-btn main-action-btn" disabled>Start Charging</button>
                </div>
                <!-- Advanced Controls -->
                <div class="advanced-controls">
                    <div class="advanced-header">Advanced Controls <i class="fa-solid fa-chevron-down"></i></div>
                    <div class="advanced-body">
                        <button class="action-btn advanced-btn get-config-btn">Get Config</button>
                        <button class="action-btn advanced-btn set-config-btn">Set Config</button>
                        <button class="action-btn advanced-btn clear-cache-btn">Clear Cache</button>
                        <button class="action-btn advanced-btn data-transfer-btn">Data Transfer</button>
                    </div>
                </div>
            `;
            chargersContainer.appendChild(this.element);

            this.dom = {
                statusTag: this.element.querySelector('.status-tag'),
                statusText: this.element.querySelector('.status-text'),
                vendorInfo: this.element.querySelector('.vendor-info'),
                modelInfo: this.element.querySelector('.model-info'),
                transactionInfo: this.element.querySelector('.transaction-info'),
                actionBtn: this.element.querySelector('.main-action-btn'),
                energyInfo: this.element.querySelector('.energy-info'),
                heartbeatIcon: this.element.querySelector('.heartbeat-icon'),
                advancedHeader: this.element.querySelector('.advanced-header'),
                getConfigBtn: this.element.querySelector('.get-config-btn'),
                setConfigBtn: this.element.querySelector('.set-config-btn'),
                clearCacheBtn: this.element.querySelector('.clear-cache-btn'),
                dataTransferBtn: this.element.querySelector('.data-transfer-btn'),
            };

            this.addEventListeners();
        }
        
        addEventListeners() {
            this.dom.actionBtn.addEventListener('click', () => {
                if (this.state.transactionId) {
                    sendRemoteCommand('RemoteStopTransaction', this.id, { transactionId: this.state.transactionId });
                } else {
                    const idTag = prompt("Enter ID Tag to start transaction:", "048E0B84");
                    if (idTag) {
                        sendRemoteCommand('RemoteStartTransaction', this.id, { idTag });
                    }
                }
            });

            this.dom.advancedHeader.addEventListener('click', () => {
                this.element.querySelector('.advanced-controls').classList.toggle('open');
            });

            this.dom.getConfigBtn.addEventListener('click', () => {
                const key = prompt("Enter configuration key to get (leave empty for all):");
                sendRemoteCommand('GetConfiguration', this.id, { key: key ? [key] : [] });
            });

            this.dom.setConfigBtn.addEventListener('click', () => {
                const key = prompt("Enter configuration key to change:");
                if (!key) return;
                const value = prompt(`Enter new value for ${key}:`);
                if (value === null) return;
                sendRemoteCommand('ChangeConfiguration', this.id, { key, value });
            });

            this.dom.clearCacheBtn.addEventListener('click', () => {
                if (confirm(`Are you sure you want to send ClearCache to ${this.id}?`)) {
                    sendRemoteCommand('ClearCache', this.id, {});
                }
            });

            this.dom.dataTransferBtn.addEventListener('click', () => {
                const vendorId = prompt("Enter Vendor ID:", "MyVendor");
                if (!vendorId) return;
                const messageId = prompt("Enter Message ID (optional):");
                const data = prompt("Enter data to transfer:");
                sendRemoteCommand('DataTransfer', this.id, { vendorId, messageId, data });
            });
        }

        updateActionButton() {
            const btn = this.dom.actionBtn;
            
            if (this.state.transactionId) {
                btn.textContent = 'Stop Charging';
                btn.className = 'action-btn main-action-btn stop-btn';
                btn.disabled = this.state.status !== 'Charging';
            } else {
                btn.textContent = 'Start Charging';
                btn.className = 'action-btn main-action-btn start-btn';
                btn.disabled = this.state.status !== 'Preparing';
            }
        }

        updateAll(newState) {
            this.state = { ...this.state, ...newState };
            this.dom.vendorInfo.textContent = this.state.vendor || 'N/A';
            this.dom.modelInfo.textContent = this.state.model || 'N/A';
            this.updateConnectionStatus(true);
            this.updateStatus(this.state.status);
            this.updateTransaction(this.state.transactionId);
        }

        updateConnectionStatus(isConnected) {
            this.updateStatus(isConnected ? (this.state.status || 'Available') : 'Disconnected');
        }

        updateStatus(status) {
            this.state.status = status;
            this.dom.statusTag.className = 'status-tag';
            this.dom.statusText.textContent = status;

            switch (status) {
                case 'Available':
                case 'Preparing':
                case 'Unavailable':
                    this.dom.statusTag.classList.add('status-available');
                    break;
                case 'Charging':
                case 'SuspendedEVSE':
                case 'SuspendedEV':
                    this.dom.statusTag.classList.add('status-charging');
                    break;
                case 'Finishing':
                    this.dom.statusTag.classList.add('status-finishing');
                    break;
                case 'Faulted':
                    this.dom.statusTag.classList.add('status-faulted');
                    break;
                default:
                    this.dom.statusTag.classList.add('status-disconnected');
                    break;
            }
            this.updateActionButton();
        }

        updateTransaction(transactionId) {
            this.state.transactionId = transactionId;
            this.dom.transactionInfo.textContent = transactionId || 'None';
            if (transactionId && !this.state.energy) {
                 this.updateEnergy(0);
            }
            this.updateActionButton();
        }

        updateEnergy(wh) {
            this.state.energy = wh;
            const kwh = (wh / 1000).toFixed(2);
            this.dom.energyInfo.textContent = `${kwh} kWh`;
        }
        
        triggerHeartbeat() {
            this.dom.heartbeatIcon.classList.add('active');
            setTimeout(() => {
                this.dom.heartbeatIcon.classList.remove('active');
            }, 1200);
        }
    }

    function connectDashboard() {
        const wsUrl = `ws://${window.location.host}/dashboard`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => console.log("Dashboard connected to CSMS.");
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const { type, id } = data;

            if (type === 'log') {
                addLogRow(data);
                return;
            }
            
            if (type === 'fullStatus') {
                chargersContainer.innerHTML = '';
                chargePointCards.clear();
                data.chargePoints.forEach(cpState => {
                    if (!chargePointCards.has(cpState.id)) {
                        chargePointCards.set(cpState.id, new ChargePointCard(cpState.id, cpState));
                    }
                });
                return;
            }
            
            if (!id) return;

            let card = chargePointCards.get(id);
            if (!card && (type === 'connect' || type === 'boot')) {
                card = new ChargePointCard(data.id, data.state);
                chargePointCards.set(data.id, card);
            }
            
            if (!card) return;

            switch (type) {
                case 'connect':
                case 'boot':
                    card.updateAll(data.state);
                    break;
                case 'disconnect':
                    card.updateConnectionStatus(false);
                    break;
                case 'status':
                    card.updateStatus(data.status);
                    break;
                case 'transactionStart':
                    card.updateTransaction(data.transactionId);
                    break;
                case 'transactionStop':
                    card.updateTransaction(null);
                    break;
                case 'meterValue':
                    card.updateEnergy(data.value);
                    break;
                case 'heartbeat':
                    card.triggerHeartbeat();
                    break;
            }
        };

        ws.onclose = () => {
            console.log("Dashboard disconnected. Reconnecting...");
            chargePointCards.forEach(card => card.updateConnectionStatus(false));
            setTimeout(connectDashboard, 3000);
        };
    }
    
    connectDashboard();
});
