document.addEventListener('DOMContentLoaded', () => {
    // Views
    const stationListView = document.getElementById('station-list-view');
    const stationDetailView = document.getElementById('station-detail-view');

    // Detail View Elements
    const backToListBtn = document.getElementById('back-to-list-btn');
    const detailStationId = document.getElementById('detail-station-id');
    const detailStationMeta = document.getElementById('detail-station-meta');
    const detailStatusTag = document.getElementById('detail-status-tag');
    const connectorDetails = document.getElementById('connector-details');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const qrcodeElement = document.getElementById('qrcode');
    const editStationBtn = document.getElementById('edit-station-btn');
    const deleteStationBtn = document.getElementById('delete-station-btn');

    // List View Elements
    const addStationBtn = document.getElementById('add-station-btn');
    const searchInput = document.getElementById('search-input');
    const stationTableBody = document.getElementById('station-table-body');

    // Modal Elements
    const addStationModal = document.getElementById('add-station-modal');
    const modalTitle = addStationModal.querySelector('.modal-header h3');
    const closeModalBtn = addStationModal.querySelector('.close-btn');
    const closeModalFooterBtn = addStationModal.querySelector('.close-modal-btn');
    const addModalBtn = addStationModal.querySelector('.add-modal-btn');
    const modalStationIdInput = document.getElementById('modal-station-id');
    const modalStationLocationInput = document.getElementById('modal-station-location');

    // State
    const stations = new Map();
    let ws = null;
    let currentEditId = null;
    let currentDetailId = null; // Track which station detail is being viewed
    let qrCodeInstance = null;

    // --- UTILS ---
    const showView = (viewToShow) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        viewToShow.classList.add('active');
    };

    const showModal = (show, stationToEdit = null) => {
        if (show) {
            currentEditId = stationToEdit ? stationToEdit.id : null;
            if (stationToEdit) {
                modalTitle.textContent = 'Edit Station';
                addModalBtn.textContent = 'SAVE';
                modalStationIdInput.value = stationToEdit.id;
                modalStationIdInput.disabled = true;
                modalStationLocationInput.value = stationToEdit.location || '';
            } else {
                modalTitle.textContent = 'Add New Station';
                addModalBtn.textContent = 'ADD';
                modalStationIdInput.value = '';
                modalStationIdInput.disabled = false;
                modalStationLocationInput.value = '';
            }
            addStationModal.style.display = 'flex';
        } else {
            addStationModal.style.display = 'none';
        }
    };

    const renderStationList = () => {
        stationTableBody.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();
        stations.forEach(station => {
            if (station.id.toLowerCase().includes(searchTerm) ||
                (station.status && station.status.toLowerCase().includes(searchTerm)) || // Add check for status existence
                (station.location && station.location.toLowerCase().includes(searchTerm))) {
                
                const row = document.createElement('tr');
                row.dataset.id = station.id;
                const status = station.status || 'Unavailable';
                row.innerHTML = `
                    <td>${station.id}</td>
                    <td><span class="status-tag status-${status.toLowerCase()}">${status}</span></td>
                    <td>${station.location || 'N/A'}</td>
                    <td>${station.lastActivity || 'N/A'}</td>
                `;
                row.addEventListener('click', () => showStationDetail(station.id));
                stationTableBody.appendChild(row);
            }
        });
    };

    const showStationDetail = (stationId) => {
        currentDetailId = stationId; // Set the current detail ID
        const station = stations.get(stationId);
        if (!station) return;

        detailStationId.textContent = station.id;
        detailStationMeta.textContent = `${station.vendor || 'N/A'} / ${station.model || 'N/A'}`;
        
        // Call the new update function
        updateDetailViewStatus(station.status || 'Unavailable');

        // Generate QR Code
        if (qrcodeElement) {
            const url = `${window.location.origin}/customer/?stationId=${station.id}`;
            if (qrCodeInstance) {
                qrCodeInstance.clear();
                qrCodeInstance.makeCode(url);
            } else {
                qrCodeInstance = new QRCode(qrcodeElement, {
                    text: url,
                    width: 150,
                    height: 150,
                });
            }
        }
        
        showView(stationDetailView);
    };

    // Function to update the detail view based on status
    const updateDetailViewStatus = (status) => {
        const safeStatus = status || 'Unavailable';
        // Update status tag
        detailStatusTag.textContent = safeStatus;
        detailStatusTag.className = `status-tag status-${safeStatus.toLowerCase()}`;

        // Update connector details
        connectorDetails.innerHTML = `<h4>Connector 1</h4><p>Status: ${safeStatus}</p>`;

        if (safeStatus === 'Available') {
            qrCodeContainer.classList.remove('hidden');
        } else {
            qrCodeContainer.classList.add('hidden');
        }
    };

    // --- WEBSOCKET CONNECTION ---
    function connect() {
        const wsUrl = `ws://${window.location.host}/scada`;
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            let station;

            switch (data.type) {
                case 'fullStatus':
                    data.chargePoints.forEach(cpState => {
                        const existingStation = stations.get(cpState.id) || {};
                        stations.set(cpState.id, { ...existingStation, ...cpState, lastActivity: new Date().toLocaleTimeString() });
                    });
                    break;
                case 'connect':
                case 'boot':
                    station = stations.get(data.id) || {};
                    stations.set(data.id, { ...station, ...data.state, lastActivity: new Date().toLocaleTimeString() });
                    if (currentDetailId === data.id) {
                        updateDetailViewStatus(data.state.status);
                    }
                    break;
                case 'disconnect':
                    station = stations.get(data.id);
                    if (station) {
                        station.status = 'Unavailable';
                        station.lastActivity = new Date().toLocaleTimeString();
                        if (currentDetailId === data.id) {
                            updateDetailViewStatus('Unavailable');
                        }
                    }
                    break;
                case 'status':
                    station = stations.get(data.id);
                    if (station) {
                        station.status = data.status;
                        station.lastActivity = new Date().toLocaleTimeString();
                        if (currentDetailId === data.id) {
                            updateDetailViewStatus(data.status);
                        }
                    }
                    break;
            }
            renderStationList();
        };

        ws.onclose = () => {
            setTimeout(connect, 3000);
        };
    }

    // --- EVENT LISTENERS ---
    backToListBtn.addEventListener('click', () => {
        currentDetailId = null; 
        showView(stationListView);
    });
    deleteStationBtn.addEventListener('click', () => {
        if (currentDetailId && confirm(`Are you sure you want to delete station "${currentDetailId}"?`)) {
            stations.delete(currentDetailId);
            renderStationList();
            showView(stationListView);
        }
    });
    editStationBtn.addEventListener('click', () => {
        if (currentDetailId) {
            showModal(true, stations.get(currentDetailId));
        }
    });
    searchInput.addEventListener('input', renderStationList);
    addStationBtn.addEventListener('click', () => showModal(true));
    closeModalBtn.addEventListener('click', () => showModal(false));
    closeModalFooterBtn.addEventListener('click', () => showModal(false));

    addModalBtn.addEventListener('click', () => {
        const id = modalStationIdInput.value.trim();
        const location = modalStationLocationInput.value.trim();

        if (currentEditId) {
            const station = stations.get(currentEditId);
            if (station) {
                station.location = location;
            }
            renderStationList();
            showStationDetail(currentEditId);
        } else {
            if (id && !stations.has(id)) {
                const newStationData = {
                    id: id,
                    status: 'Provisioned',
                    location: location,
                    vendor: 'N/A',
                    model: 'N/A',
                    lastActivity: new Date().toLocaleTimeString()
                };
                stations.set(id, newStationData);
                renderStationList();
            } else if (!id) {
                alert("Please enter a station ID.");
                return;
            } else {
                alert(`Station with ID "${id}" already exists.`);
                return;
            }
        }
        showModal(false);
    });

    connect();
});
