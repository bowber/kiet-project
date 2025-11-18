document.addEventListener('DOMContentLoaded', () => {
    // --- VIEW MANAGEMENT ---
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const targetViewId = item.dataset.view;
            views.forEach(view => {
                view.classList.toggle('active', view.id === targetViewId);
            });
        });
    });

    // --- OCPP CONNECTION LOGIC ---
    const connectBtn = document.getElementById('connect-btn');
    const backendUrlInput = document.getElementById('backend-url-input');
    const chargeboxIdInput = document.getElementById('chargebox-id-input');
    const statusBanner = document.querySelector('.connection-status-banner');
    const connectorsContainer = document.getElementById('connectors-container');
    const toggleScannerBtn = document.getElementById('toggle-scanner-btn');
    const qrReaderElement = document.getElementById('qr-reader');
    
    let websocket = null;
    let chargePoint = null;
    let html5QrCode = null;
    let isScanning = false;

    // --- QR CODE SCANNER ---
    const startScanner = async () => {
        try {
            if (!html5QrCode) {
                html5QrCode = new Html5Qrcode("qr-reader");
            }
            
            qrReaderElement.classList.add('active');
            toggleScannerBtn.classList.add('active');
            toggleScannerBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scanner';
            isScanning = true;

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                onScanSuccess,
                onScanError
            );
        } catch (err) {
            console.error("Unable to start scanner:", err);
            alert("Camera access denied or not available. Please use manual entry.");
            stopScanner();
        }
    };

    const stopScanner = async () => {
        if (html5QrCode && isScanning) {
            try {
                await html5QrCode.stop();
                qrReaderElement.classList.remove('active');
                toggleScannerBtn.classList.remove('active');
                toggleScannerBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Start Scanner';
                isScanning = false;
            } catch (err) {
                console.error("Error stopping scanner:", err);
            }
        }
    };

    const onScanSuccess = (decodedText) => {
        console.log(`QR Code detected: ${decodedText}`);
        stopScanner();
        parseAndFillFromUrl(decodedText);
        
        // Show success message
        statusBanner.style.display = 'block';
        statusBanner.className = 'connection-status-banner success';
        statusBanner.textContent = 'QR Code scanned successfully! Click Connect to proceed.';
    };

    const onScanError = (error) => {
        // Silent error handling for continuous scanning
    };

    const parseAndFillFromUrl = (url) => {
        try {
            const urlObj = new URL(url);
            const stationId = urlObj.searchParams.get('stationId');
            
            if (stationId) {
                // Extract protocol and host from current location or scanned URL
                const protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
                const backendUrl = `${protocol}//${urlObj.host}`;
                
                backendUrlInput.value = backendUrl;
                chargeboxIdInput.value = stationId;
                
                console.log(`Auto-filled: Backend=${backendUrl}, Station=${stationId}`);
            }
        } catch (err) {
            console.error("Invalid URL format:", err);
            alert("Invalid QR code format. Please scan a valid station QR code.");
        }
    };

    // Toggle scanner on button click
    toggleScannerBtn.addEventListener('click', () => {
        if (isScanning) {
            stopScanner();
        } else {
            startScanner();
        }
    });

    // Check URL parameters on page load
    const urlParams = new URLSearchParams(window.location.search);
    const stationIdParam = urlParams.get('stationId');
    
    if (stationIdParam) {
        // Auto-fill from URL parameters
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const backendUrl = `${protocol}//${window.location.host}`;
        backendUrlInput.value = backendUrl;
        chargeboxIdInput.value = stationIdParam;
        
        // Switch to connection view
        navItems.forEach(i => i.classList.remove('active'));
        document.querySelector('[data-view="connection-view"]').classList.add('active');
        views.forEach(view => {
            view.classList.toggle('active', view.id === 'connection-view');
        });
        
        // Show success banner
        statusBanner.style.display = 'block';
        statusBanner.className = 'connection-status-banner success';
        statusBanner.textContent = `Station ${stationIdParam} loaded from QR code. Click Connect to proceed.`;
    }

    const generateUniqueId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const sendMessage = (type, uniqueId, action, payload = {}) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const message = [type, uniqueId, action, payload];
            websocket.send(JSON.stringify(message));
            console.log('SENT:', message);
            return message;
        }
        return null;
    };
    
    const sendRequest = (action, payload) => sendMessage(2, generateUniqueId(), action, payload);
    const sendResponse = (uniqueId, payload) => sendMessage(3, uniqueId, payload);


    connectBtn.addEventListener('click', () => {
        const backendUrl = backendUrlInput.value.trim();
        const chargeboxId = chargeboxIdInput.value.trim();

        if (!backendUrl || !chargeboxId) {
            alert('Please provide both Backend URL and Chargebox ID.');
            return;
        }

        const fullUrl = `${backendUrl}/${chargeboxId}`;
        statusBanner.style.display = 'block';
        statusBanner.className = 'connection-status-banner';
        statusBanner.textContent = `Connecting to ${fullUrl}...`;

        if (websocket) websocket.close();

        websocket = new WebSocket(fullUrl);

        websocket.onopen = () => {
            statusBanner.classList.add('success');
            statusBanner.textContent = `Successfully connected to ${chargeboxId}.`;
            chargePoint = new ChargePointStatus(chargeboxId, sendRequest, sendResponse);
            connectorsContainer.innerHTML = '';
            connectorsContainer.appendChild(chargePoint.getElement());
            
            sendRequest("BootNotification", { chargePointVendor: "MicroOcppUI", chargePointModel: "WebSim" });
        };

        websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            console.log('RECEIVED:', message);
            if (chargePoint) {
                chargePoint.handleMessage(message);
            }
        };

        websocket.onerror = () => {
            statusBanner.classList.add('error');
            statusBanner.textContent = `Error while connecting to ${fullUrl}.`;
        };
        
        websocket.onclose = () => {
             if (chargePoint) {
                statusBanner.classList.add('error');
                statusBanner.textContent = `Connection with ${chargeboxId} closed.`;
                chargePoint = null;
             }
        };
    });

    // --- CHARGE POINT STATUS CLASS ---
    class ChargePointStatus {
        constructor(id, sendRequestCallback, sendResponseCallback) {
            this.id = id;
            this.sendRequest = sendRequestCallback;
            this.sendResponse = sendResponseCallback;
            this.transactionId = null;
            this.meterValue = 0;
            this.meterValueIntervalId = null;
            this.isPluggedIn = false;
            this.isEvReady = false;
            
            // Charging parameters
            this.BATTERY_CAPACITY = 5; // kWh
            this.CHARGING_POWER = 6; // kW
            this.PRICE_PER_KWH = 10000; // VND
            
            // Load current power level from localStorage, default 26%
            this.currentPowerLevel = parseInt(localStorage.getItem('currentPowerLevel') || '26');
            this.targetPowerLevel = 100;
            
            this.chargingStartTime = null;
            this.chargingStartPercentage = null;
            this.chargingDuration = null; // in seconds

            this.configuration = {
                'HeartbeatInterval': '60',
                'ConnectionTimeOut': '120',
                'SupportedFeatureProfiles': 'Core,RemoteTrigger,Configuration',
                'ChargeProfileMaxStackLevel': '10',
                'AllowOfflineTxForUnknownId': 'false'
            };
            
            this.createElement();
            this.cacheDOMElements();
            this.addEventListeners();
            this.updateStatusUI('Offline');
        }

        createElement() {
            this.element = document.createElement('div');
            this.element.className = 'status-card';
            this.element.innerHTML = `
                <div class="status-display status-available">
                    <div class="status-icon-wrapper"><i class="fas fa-check-circle status-icon"></i></div>
                    <div class="status-text">Available</div>
                </div>
                <div class="connector-section">
                    <div class="connector-header"><h4>Connector 1</h4><div class="live-indicator"><span class="dot"></span> LIVE</div></div>
                    <div class="connector-status-grid">
                        <button class="connector-status-item interactive plug-status-btn"><i class="fas fa-plug"></i><span class="connector-status-text">Unplugged</span></button>
                        <button class="connector-status-item interactive ev-status-btn" disabled><i class="fas fa-car"></i><span class="ev-status-text">Ready</span></button>
                    </div>
                </div>
                <div class="metrics-grid">
                    <div class="metric-item"><span class="metric-label">Energy</span><span class="metric-value energy-value">0 Wh</span></div>
                    <div class="metric-item"><span class="metric-label">Power</span><span class="metric-value power-value">0 W</span></div>
                </div>
                
                <!-- Payment Section -->
                <div class="payment-section" style="display: none;">
                    <div class="payment-header">
                        <h4><i class="fas fa-bolt"></i> Select Charging Target</h4>
                    </div>
                    
                    <div class="battery-status">
                        <div class="battery-info-row">
                            <span class="battery-label">Current Level:</span>
                            <span class="battery-current">${this.currentPowerLevel}%</span>
                        </div>
                        <div class="battery-info-row">
                            <span class="battery-label">Target Level:</span>
                            <span class="battery-target">100%</span>
                        </div>
                    </div>
                    
                    <div class="slider-container">
                        <input type="range" class="target-slider" min="${this.currentPowerLevel}" max="100" value="100" step="1">
                        <div class="slider-labels">
                            <span>${this.currentPowerLevel}%</span>
                            <span>100%</span>
                        </div>
                    </div>
                    
                    <div class="charging-estimate">
                        <div class="estimate-item">
                            <i class="fas fa-clock"></i>
                            <div class="estimate-content">
                                <span class="estimate-label">Estimated Time</span>
                                <span class="estimate-value time-estimate">37 mins</span>
                            </div>
                        </div>
                        <div class="estimate-item">
                            <i class="fas fa-money-bill-wave"></i>
                            <div class="estimate-content">
                                <span class="estimate-label">Estimated Cost</span>
                                <span class="estimate-value cost-estimate">37,000 VND</span>
                            </div>
                        </div>
                    </div>
                    
                    <button class="action-btn confirm-payment-btn">
                        <i class="fas fa-check-circle"></i> Start Charging
                    </button>
                </div>
                
                <!-- VietQR Payment Section -->
                <div class="vietqr-section" style="display: none;">
                    <div class="vietqr-header">
                        <h4><i class="fas fa-qrcode"></i> Scan to Pay</h4>
                        <p class="qr-instruction">Scan this QR code to complete payment</p>
                    </div>
                    <div class="qr-code-container">
                        <img class="vietqr-image" src="" alt="VietQR Payment">
                    </div>
                    <div class="payment-amount-display">
                        <span class="amount-label">Amount:</span>
                        <span class="amount-value">0 VND</span>
                    </div>
                </div>
                
                <!-- Charging Progress Section -->
                <div class="charging-progress-section" style="display: none;">
                    <div class="charging-info">
                        <div class="charging-status-row">
                            <span class="charging-label">Charging</span>
                            <span class="charging-percentage">${this.currentPowerLevel}% → <span class="charging-target">100%</span></span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${this.currentPowerLevel}%"></div>
                        </div>
                        <div class="charging-time-row">
                            <span class="time-label">Time Remaining:</span>
                            <span class="time-remaining">--:--</span>
                        </div>
                    </div>
                </div>
                
                <div class="action-footer"><button class="action-btn start-stop-btn" disabled>Start Charging</button></div>
            `;
        }
        
        cacheDOMElements() {
            this.dom = {
                statusDisplay: this.element.querySelector('.status-display'),
                statusIcon: this.element.querySelector('.status-icon'),
                statusText: this.element.querySelector('.status-text'),
                startStopBtn: this.element.querySelector('.start-stop-btn'),
                plugStatusBtn: this.element.querySelector('.plug-status-btn'),
                evStatusBtn: this.element.querySelector('.ev-status-btn'),
                plugStatusText: this.element.querySelector('.plug-status-btn .connector-status-text'),
                evStatusText: this.element.querySelector('.ev-status-btn .ev-status-text'),
                energyValue: this.element.querySelector('.energy-value'),
                powerValue: this.element.querySelector('.power-value'),
                // Payment section elements
                paymentSection: this.element.querySelector('.payment-section'),
                batteryCurrent: this.element.querySelector('.battery-current'),
                targetSlider: this.element.querySelector('.target-slider'),
                batteryTarget: this.element.querySelector('.battery-target'),
                sliderLabels: this.element.querySelector('.slider-labels'),
                timeEstimate: this.element.querySelector('.time-estimate'),
                costEstimate: this.element.querySelector('.cost-estimate'),
                confirmPaymentBtn: this.element.querySelector('.confirm-payment-btn'),
                // VietQR section elements
                vietqrSection: this.element.querySelector('.vietqr-section'),
                vietqrImage: this.element.querySelector('.vietqr-image'),
                amountValue: this.element.querySelector('.amount-value'),
                // Charging progress elements
                chargingProgressSection: this.element.querySelector('.charging-progress-section'),
                chargingPercentage: this.element.querySelector('.charging-percentage'),
                chargingTarget: this.element.querySelector('.charging-target'),
                progressBarFill: this.element.querySelector('.progress-bar-fill'),
                timeRemaining: this.element.querySelector('.time-remaining'),
            };
        }
        
        generateVietQR(amount) {
            // VietQR API format: https://img.vietqr.io/image/[BANK_ID]-[ACCOUNT_NUMBER]-[TEMPLATE].png?amount=[AMOUNT]&addInfo=[DESCRIPTION]
            const bankId = 'MB'; // MB Bank (you can change this)
            const accountNumber = '0123456789'; // Your account number
            const template = 'compact2'; // QR template style
            const description = encodeURIComponent('Charging Payment');
            
            return `https://img.vietqr.io/image/${bankId}-${accountNumber}-${template}.png?amount=${amount}&addInfo=${description}&accountName=EV%20Charging`;
        }
        
        showToast(message) {
            // Create toast element
            const toast = document.createElement('div');
            toast.className = 'payment-toast';
            toast.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>${message}</span>
            `;
            document.body.appendChild(toast);
            
            // Trigger animation
            setTimeout(() => toast.classList.add('show'), 10);
            
            // Remove after 3 seconds
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => document.body.removeChild(toast), 300);
            }, 3000);
        }

        calculateChargingEstimate(targetLevel) {
            // Calculate energy needed (kWh)
            const percentageDiff = targetLevel - this.currentPowerLevel;
            const energyNeeded = (percentageDiff / 100) * this.BATTERY_CAPACITY;
            
            // Calculate time (hours)
            const timeHours = energyNeeded / this.CHARGING_POWER;
            const timeMinutes = Math.round(timeHours * 60);
            
            // Calculate cost (VND)
            const cost = Math.round(energyNeeded * this.PRICE_PER_KWH);
            
            return {
                timeMinutes,
                cost,
                energyNeeded
            };
        }

        formatTime(minutes) {
            if (minutes < 60) {
                return `${minutes} mins`;
            } else {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
            }
        }

        updateEstimates() {
            const estimate = this.calculateChargingEstimate(this.targetPowerLevel);
            this.dom.timeEstimate.textContent = this.formatTime(estimate.timeMinutes);
            this.dom.costEstimate.textContent = `${estimate.cost.toLocaleString()} VND`;
            
            // Enable/disable and style button based on target level
            if (this.targetPowerLevel > this.currentPowerLevel) {
                this.dom.confirmPaymentBtn.disabled = false;
                this.dom.confirmPaymentBtn.classList.add('enabled');
            } else {
                this.dom.confirmPaymentBtn.disabled = true;
                this.dom.confirmPaymentBtn.classList.remove('enabled');
            }
        }

        addEventListeners() {
            this.dom.plugStatusBtn.addEventListener('click', () => {
                this.isPluggedIn = !this.isPluggedIn;
                this.dom.plugStatusBtn.classList.toggle('active', this.isPluggedIn);
                this.dom.plugStatusText.textContent = this.isPluggedIn ? 'Plugged In' : 'Unplugged';
                
                if (this.isPluggedIn) {
                    this.dom.evStatusBtn.disabled = false;
                    this.sendRequest("StatusNotification", { connectorId: 1, status: "Unavailable", errorCode: "NoError" });
                    this.updateStatusUI('Unavailable');
                } else {
                    this.isEvReady = false;
                    this.dom.evStatusBtn.disabled = true;
                    this.dom.evStatusBtn.classList.remove('active');
                    this.sendRequest("StatusNotification", { connectorId: 1, status: "Available", errorCode: "NoError" });
                    this.updateStatusUI('Available');
                }
            });

            this.dom.evStatusBtn.addEventListener('click', () => {
                this.isEvReady = !this.isEvReady;
                this.dom.evStatusBtn.classList.toggle('active', this.isEvReady);
                
                if (this.isEvReady && this.isPluggedIn) {
                    this.sendRequest("StatusNotification", { connectorId: 1, status: "Preparing", errorCode: "NoError" });
                    this.updateStatusUI('Preparing');
                    // Show payment interface when ready
                    this.showPaymentSection();
                } else if (this.isPluggedIn) {
                    this.sendRequest("StatusNotification", { connectorId: 1, status: "Unavailable", errorCode: "NoError" });
                    this.updateStatusUI('Unavailable');
                    this.hidePaymentSection();
                }
            });

            // Target slider
            this.dom.targetSlider.addEventListener('input', (e) => {
                this.targetPowerLevel = parseInt(e.target.value);
                this.dom.batteryTarget.textContent = `${this.targetPowerLevel}%`;
                this.updateEstimates();
            });
            
            // Confirm payment and start charging
            this.dom.confirmPaymentBtn.addEventListener('click', () => {
                const estimate = this.calculateChargingEstimate(this.targetPowerLevel);
                this.showVietQRPayment(estimate.cost);
            });
            
            // Stop charging button
            this.dom.startStopBtn.addEventListener('click', () => {
                if (this.transactionId) {
                    this.stopChargingProcess();
                }
            });
        }

        refreshPaymentUI() {
            // Update current battery level display
            this.dom.batteryCurrent.textContent = `${this.currentPowerLevel}%`;
            
            // Update slider min value and current value
            this.dom.targetSlider.min = this.currentPowerLevel;
            this.dom.targetSlider.value = Math.max(this.currentPowerLevel, this.targetPowerLevel);
            this.targetPowerLevel = parseInt(this.dom.targetSlider.value);
            
            // Update slider labels
            this.dom.sliderLabels.innerHTML = `
                <span>${this.currentPowerLevel}%</span>
                <span>100%</span>
            `;
            
            // Update target display
            this.dom.batteryTarget.textContent = `${this.targetPowerLevel}%`;
        }

        showPaymentSection() {
            this.refreshPaymentUI();
            this.dom.paymentSection.style.display = 'block';
            this.updateEstimates();
        }

        hidePaymentSection() {
            this.dom.paymentSection.style.display = 'none';
        }

        showVietQRPayment(amount) {
            // Hide payment section
            this.hidePaymentSection();
            
            // Generate VietQR code
            const qrUrl = this.generateVietQR(amount);
            this.dom.vietqrImage.src = qrUrl;
            this.dom.amountValue.textContent = `${amount.toLocaleString()} VND`;
            
            // Show VietQR section
            this.dom.vietqrSection.style.display = 'block';
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                this.dom.vietqrSection.style.display = 'none';
                this.showToast('Payment successful!');
                
                // Start charging after toast
                setTimeout(() => {
                    this.startChargingProcess('MOBILE_APP_USER');
                    this.showChargingProgress();
                }, 500);
            }, 5000);
        }

        showChargingProgress() {
            this.dom.chargingProgressSection.style.display = 'block';
            this.dom.startStopBtn.disabled = false;
            this.dom.startStopBtn.textContent = 'Stop Charging';
            this.dom.startStopBtn.className = 'action-btn start-stop-btn stop';
            
            // Set the target percentage display
            this.dom.chargingTarget.textContent = `${this.targetPowerLevel}%`;
            
            // Calculate charging duration
            const estimate = this.calculateChargingEstimate(this.targetPowerLevel);
            this.chargingDuration = estimate.timeMinutes * 60; // convert to seconds
            this.chargingStartTime = Date.now();
            
            // Store the starting percentage for display
            this.chargingStartPercentage = this.currentPowerLevel;
            
            this.updateChargingProgress();
        }

        hideChargingProgress() {
            this.dom.chargingProgressSection.style.display = 'none';
        }

        updateChargingProgress() {
            if (!this.transactionId || !this.chargingStartTime) return;
            
            const elapsed = (Date.now() - this.chargingStartTime) / 1000; // seconds
            const totalPercentageGain = this.targetPowerLevel - this.chargingStartPercentage;
            const percentageGained = (elapsed / this.chargingDuration) * totalPercentageGain;
            const currentPercentage = Math.min(this.chargingStartPercentage + percentageGained, this.targetPowerLevel);
            const remaining = Math.max(this.chargingDuration - elapsed, 0);
            
            // Update UI - Show "current% → target%" format
            this.dom.chargingPercentage.innerHTML = `${Math.floor(currentPercentage)}% → <span class="charging-target">${this.targetPowerLevel}%</span>`;
            this.dom.progressBarFill.style.width = `${currentPercentage}%`;
            
            // Format remaining time
            const minutes = Math.floor(remaining / 60);
            const seconds = Math.floor(remaining % 60);
            this.dom.timeRemaining.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Check if charging complete
            if (currentPercentage >= this.targetPowerLevel) {
                // Save new power level to localStorage
                this.currentPowerLevel = this.targetPowerLevel;
                localStorage.setItem('currentPowerLevel', this.currentPowerLevel.toString());
                this.stopChargingProcess();
            }
        }

        getElement() { return this.element; }

        handleMessage(message) {
            const [type, uniqueId, actionOrPayload, payload] = message;

            if (type === 2) { // It's a CALL (a command from the server)
                this.handleRemoteCommand(uniqueId, actionOrPayload, payload);
            } else if (type === 3) { // It's a CALLRESULT (a response to our request)
                if (actionOrPayload.status === 'Accepted' && actionOrPayload.interval) {
                    this.sendRequest("StatusNotification", { connectorId: 1, status: "Available", errorCode: "NoError" });
                    this.updateStatusUI('Available');
                }

                if (actionOrPayload.transactionId && actionOrPayload.idTagInfo && actionOrPayload.idTagInfo.status === 'Accepted') {
                    console.log(`Transaction confirmed by server with ID: ${actionOrPayload.transactionId}`);
                    this.transactionId = actionOrPayload.transactionId;
                    
                    this.sendRequest("StatusNotification", { connectorId: 1, status: "Charging", errorCode: "NoError" });
                    this.startSendingMeterValues(this.transactionId);
                    this.updateStatusUI('Charging');
                }
            }
        }

        handleRemoteCommand(uniqueId, action, payload) {
            console.log(`Handling remote command: ${action}`);
            switch(action) {
                case 'RemoteStartTransaction':
                    if (this.isPluggedIn && this.isEvReady) {
                        this.sendResponse(uniqueId, { status: "Accepted" });
                        this.startChargingProcess(payload.idTag);
                    } else {
                        this.sendResponse(uniqueId, { status: "Rejected" });
                        console.log("Rejected RemoteStart: Not Plugged in or Not Ready.");
                    }
                    break;
                case 'RemoteStopTransaction':
                    if (payload.transactionId === this.transactionId) {
                        this.sendResponse(uniqueId, { status: "Accepted" });
                        this.stopChargingProcess();
                    } else {
                        console.error(`Rejected StopTransaction. Server ID: ${payload.transactionId}, Local ID: ${this.transactionId}`);
                        this.sendResponse(uniqueId, { status: "Rejected" });
                    }
                    break;
                
                case 'GetConfiguration':
                    const requestedKeys = payload.key || Object.keys(this.configuration);
                    const configurationKey = [];
                    const unknownKey = [];
                    requestedKeys.forEach(k => {
                        if (this.configuration.hasOwnProperty(k)) {
                            configurationKey.push({ key: k, readonly: false, value: this.configuration[k] });
                        } else {
                            unknownKey.push(k);
                        }
                    });
                    this.sendResponse(uniqueId, { configurationKey, unknownKey });
                    break;

                case 'ChangeConfiguration':
                    const { key, value } = payload;
                    if (this.configuration.hasOwnProperty(key)) {
                        this.configuration[key] = value;
                        console.log(`Configuration updated: ${key} = ${value}`);
                        this.sendResponse(uniqueId, { status: "Accepted" });
                    } else {
                        this.sendResponse(uniqueId, { status: "NotSupported" });
                    }
                    break;

                case 'ClearCache':
                    console.log("Simulating ClearCache... Authorization cache cleared.");
                    this.sendResponse(uniqueId, { status: "Accepted" });
                    break;
                
                case 'DataTransfer':
                    console.log(`Received DataTransfer from server:`, payload);
                    this.sendResponse(uniqueId, { status: "Accepted", data: "Server data successfully processed." });
                    break;
                
                default:
                     this.sendResponse(uniqueId, { status: "Rejected" });
            }
        }

        startChargingProcess(idTag) {
            this.sendRequest("Authorize", { idTag });
            this.sendRequest("StartTransaction", { 
                connectorId: 1, 
                idTag, 
                meterStart: 0, 
                timestamp: new Date().toISOString()
            });
        }

        stopChargingProcess() {
            this.sendRequest("StopTransaction", { 
                transactionId: this.transactionId, 
                meterStop: this.meterValue, 
                timestamp: new Date().toISOString() 
            });
            this.stopSendingMeterValues();
            this.hideChargingProgress();
            this.sendRequest("StatusNotification", { connectorId: 1, status: "Finishing", errorCode: "NoError" });
            this.updateStatusUI('Finishing');
            
            setTimeout(() => {
                this.isEvReady = false;
                this.dom.evStatusBtn.classList.remove('active');

                const newStatus = this.isPluggedIn ? "Unavailable" : "Available";
                this.sendRequest("StatusNotification", { connectorId: 1, status: newStatus, errorCode: "NoError" });
                this.updateStatusUI(newStatus);
                this.transactionId = null; 
                this.chargingStartTime = null;
            }, 2000);
        }

        updateStatusUI(status) {
            this.dom.statusDisplay.className = 'status-display';

            this.dom.plugStatusBtn.disabled = true;
            this.dom.evStatusBtn.disabled = true;

            switch (status) {
                case 'Available':
                    this.dom.statusDisplay.classList.add('status-available');
                    this.dom.statusIcon.className = 'fas fa-check-circle status-icon';
                    this.dom.statusText.textContent = 'Available';
                    this.dom.plugStatusBtn.disabled = false;
                    this.dom.startStopBtn.style.display = 'none';
                    break;
                case 'Unavailable':
                    this.dom.statusDisplay.classList.add('status-unavailable');
                    this.dom.statusIcon.className = 'fas fa-pause-circle status-icon';
                    this.dom.statusText.textContent = 'Plugged In';
                    this.dom.plugStatusBtn.disabled = false;
                    this.dom.evStatusBtn.disabled = false;
                    this.dom.startStopBtn.style.display = 'none';
                    break;
                case 'Preparing':
                    this.dom.statusDisplay.classList.add('status-charging');
                    this.dom.statusIcon.className = 'fas fa-plug status-icon';
                    this.dom.statusText.textContent = 'Preparing';
                    this.dom.plugStatusBtn.disabled = false;
                    this.dom.evStatusBtn.disabled = false;
                    this.dom.startStopBtn.style.display = 'none';
                    break;
                case 'Charging':
                    this.dom.statusDisplay.classList.add('status-charging');
                    this.dom.statusIcon.className = 'fas fa-bolt status-icon';
                    this.dom.statusText.textContent = 'Charging';
                    this.dom.startStopBtn.style.display = 'block';
                    break;
                case 'Finishing':
                    this.dom.statusDisplay.classList.add('status-charging');
                    this.dom.statusIcon.className = 'fas fa-spinner fa-spin status-icon';
                    this.dom.statusText.textContent = 'Finishing...';
                    this.dom.startStopBtn.style.display = 'none';
                    break;
                case 'Offline':
                    this.dom.statusDisplay.classList.add('status-error');
                    this.dom.statusIcon.className = 'fas fa-times-circle status-icon';
                    this.dom.statusText.textContent = 'Offline';
                    this.dom.startStopBtn.style.display = 'none';
                    break;
            }
        }
        
        startSendingMeterValues(txId) {
            this.meterValue = 0;
            if (this.meterValueIntervalId) clearInterval(this.meterValueIntervalId);
            this.meterValueIntervalId = setInterval(() => {
                this.meterValue += 100;
                const power = Math.floor(Math.random() * (7000 - 6000 + 1) + 6000);
                this.dom.energyValue.textContent = `${this.meterValue} Wh`;
                this.dom.powerValue.textContent = `${power} W`;
                this.sendRequest("MeterValues", {
                    connectorId: 1,
                    transactionId: txId,
                    meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: this.meterValue.toString(), unit: "Wh" }] }]
                });
                
                // Update charging progress
                this.updateChargingProgress();
            }, 5000);
        }
        
        stopSendingMeterValues() {
            clearInterval(this.meterValueIntervalId);
            this.meterValue = 0;
            this.dom.energyValue.textContent = '0 Wh';
            this.dom.powerValue.textContent = '0 W';
        }
    }
});
