# AGENTS.md - Development Guide for OCPP CSMS Simulator

## Build/Run Commands
- **Start server**: `npm start` or `node server.js`
- **Install dependencies**: `npm install`
- **No tests configured**: This project currently has no automated test suite
- **Database**: Requires MySQL server running on localhost with `ocpp_csms` database

## Project Structure
- **Backend**: Node.js (server.js) spawns Python handlers (OCPP_handler.py) for each charge point
- **Frontend**: Vanilla JavaScript in `public/` directory (dashboard, SCADA, customer views)
- **Database**: MySQL with connection pooling (database.js)
- **OPC UA Server**: Runs on port 4840 for industrial automation integration

## Code Style
- **Language**: Mixed Node.js/JavaScript and Python
- **Naming**: camelCase for JS variables/functions; snake_case for Python; SCREAMING_SNAKE_CASE for constants
- **Comments**: Vietnamese comments throughout codebase (maintain this convention)
- **Error handling**: Use try-catch blocks; log errors to console with descriptive prefixes like `[Master]`, `[OPC UA]`, `[Database]`, `[Python]`
- **No linter/formatter**: No ESLint, Prettier, or Python linters configured
- **Types**: Plain JavaScript (no TypeScript); no JSDoc or type annotations

## Key Patterns
- WebSocket communication between charge points, dashboards, and server
- Python child processes handle OCPP message logic; Node.js handles routing and state management
- OPC UA nodes created dynamically per charge point with bindVariable for remote control
- Broadcast pattern: `broadcastToDashboards()` sends updates to all connected dashboard clients
- State management: In-memory Maps (`clients.chargePoints`, `clients.dashboards`)
