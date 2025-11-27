# OCPP CSMS Simulator

A full-featured OCPP CSMS (Central System Management System) simulator developed for learning and research purposes in the EV charging station domain.

## Overview

This project simulates a Central System Management System (CSMS) following the OCPP 1.6 standard, enabling:
- Connection and management of multiple Charge Points via WebSocket
- Real-time monitoring through a Web Dashboard
- Integration with SCADA/PLC systems via OPC UA Server
- Charge Point simulation from an Android mobile app

## Key Features

| Feature | Description |
|---------|-------------|
| **OCPP 1.6 Protocol** | Supports standard OCPP messages (BootNotification, Heartbeat, StartTransaction, StopTransaction, MeterValues, etc.) |
| **WebSocket Server** | Real-time communication between Charge Points and CSMS |
| **OPC UA Server** | Integration with industrial automation systems (WinCC, PLC) |
| **Web Dashboard** | Visual management interface displaying Charge Point status |
| **SCADA Interface** | Monitoring and control interface for operations |
| **Customer Portal** | End-user information portal |
| **Mobile App** | Android app simulating a Charge Point with QR Scanner |
| **MySQL Database** | Storage for Charge Point data and transactions |

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CSMS Server                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Node.js    │  │   Python    │  │     OPC UA Server       │  │
│  │  WebSocket  │◄─┤   Handler   │  │     (Port 4840)         │  │
│  │  (Port 9000)│  │  (OCPP Logic)│  └───────────┬─────────────┘  │
│  └──────┬──────┘  └─────────────┘              │               │
│         │                                       │               │
│  ┌──────┴──────┐                       ┌───────┴───────┐       │
│  │   MySQL     │                       │  WinCC/SCADA  │       │
│  │  Database   │                       │     PLC       │       │
│  └─────────────┘                       └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │ WebSocket          │ WebSocket          │ HTTP
         │                    │                    │
┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴────────┐
│   Charge Point  │  │   Mobile App    │  │   Dashboard    │
│   (Simulator)   │  │   (Android)     │  │   (Web UI)     │
└─────────────────┘  └─────────────────┘  └────────────────┘
```

## System Requirements

### Running with Docker (Recommended)
- Docker Engine 20.10+
- Docker Compose 2.0+

### Running Locally (Development)
- Node.js 16+
- Python 3.8+
- MySQL 8.0+

## Installation & Running

### Option 1: Docker (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd kiet-project

# Create .env file (optional)
cp .env.example .env

# Start the application
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop the application
docker-compose down

# Reset data and restart
docker-compose down -v && docker-compose up -d
```

### Option 2: Local Development

```bash
# 1. Install MySQL and create database
mysql -u root -p -e "CREATE DATABASE ocpp_csms;"

# 2. Configure database connection in database.js

# 3. Install dependencies
npm install

# 4. Start server
npm start
```

## Accessing the Application

| Interface | URL |
|-----------|-----|
| Dashboard | http://localhost:9000 |
| SCADA | http://localhost:9000/SCADA |
| Customer Portal | http://localhost:9000/customer |
| OPC UA Server | opc.tcp://localhost:4840 |

## Project Structure

```
kiet-project/
├── server.js              # Main Node.js WebSocket server
├── database.js            # MySQL connection pooling
├── OCPP_handler.py        # Python OCPP message handler
├── OCPP_message.py        # Python OCPP message helpers
├── public/                # Frontend files
│   ├── index.html         # Main dashboard
│   ├── app.js             # Dashboard logic
│   ├── style.css          # Dashboard styles
│   ├── SCADA/             # SCADA interface
│   └── customer/          # Customer portal
├── mobile-app/            # Tauri v2 mobile application
│   ├── src/               # Rust source code
│   ├── public/            # Mobile frontend
│   └── gen/android/       # Android project
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile             # Docker image definition
├── init.sql               # Database initialization script
└── AGENTS.md              # Development guide
```

## Mobile Application (Android)

The project includes an Android mobile app built with Tauri v2, allowing simulation of a Charge Point.

**Features:**
- QR code scanning for quick CSMS connection
- OCPP 1.6 protocol support via WebSocket
- Simulate charging operations: start, stop, send meter values
- User-friendly interface

**Download:**
- APK builds are automatically generated via GitHub Actions
- Download the latest version from [Releases](https://github.com/bowber/kiet-project/releases)

**See also:** [mobile-app/ANDROID_BUILD_NOTES.md](mobile-app/ANDROID_BUILD_NOTES.md)

## Deployment

### Automated with GitHub Actions

This project supports automated deployment to a VPS via GitHub Actions.

**Setup:**
1. Add GitHub Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, database credentials
2. Push code to `main` branch or manually trigger the workflow
3. Application will be deployed automatically

**See details:** [.github/DEPLOYMENT.md](.github/DEPLOYMENT.md)

### Manual Deployment

```bash
# SSH into your VPS
ssh user@your-vps

# Clone and run
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
cp .env.example .env
# Edit .env with your database credentials

docker-compose up -d
```

## Ports

| Port | Purpose |
|------|---------|
| 9000 | HTTP/WebSocket Server (Dashboard, SCADA, Customer portal) |
| 4840 | OPC UA Server |
| 3306 | MySQL Database (Docker only) |

## Troubleshooting

### Container won't start
```bash
docker-compose logs          # View detailed logs
docker-compose restart       # Restart services
```

### Database connection error
```bash
docker-compose ps            # Check MySQL container status
docker-compose logs mysql    # View MySQL logs
```

### Port already in use
```yaml
# Edit docker-compose.yml
ports:
  - "9001:9000"  # Change from 9000 to 9001
```

### Kill process occupying a port
```bash
# Linux/Mac
lsof -i :9000
kill -9 <PID>

# Windows
netstat -ano | findstr :9000
taskkill /PID <PID> /F
```

## Development

See [AGENTS.md](AGENTS.md) for more details on:
- Code style guidelines
- Naming conventions
- Error handling patterns
- System architecture

## License

ISC
