#!/bin/bash

# Build script for OCPP Mobile Client

set -e

echo "🚀 OCPP Mobile Client Build Script"
echo "===================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Tauri CLI is installed
if ! command -v cargo-tauri &> /dev/null; then
    echo -e "${RED}❌ Tauri CLI not found${NC}"
    echo "Installing Tauri CLI..."
    cargo install tauri-cli --version "^2.0.0"
fi

# Menu
echo ""
echo "Select build target:"
echo "1) Desktop (Development)"
echo "2) Android (Development)"
echo "3) Android (Release APK)"
echo "4) iOS (Development - macOS only)"
echo "5) iOS (Release - macOS only)"
echo "6) Exit"
echo ""
read -p "Enter choice [1-6]: " choice

cd "$(dirname "$0")"

case $choice in
    1)
        echo -e "${GREEN}🖥️  Building for Desktop...${NC}"
        cargo tauri dev
        ;;
    2)
        echo -e "${GREEN}🤖 Building for Android (Debug)...${NC}"
        
        # Check if Android project is initialized
        if [ ! -d "gen/android" ]; then
            echo -e "${YELLOW}⚠️  Android project not initialized. Initializing...${NC}"
            cargo tauri android init
        fi
        
        cargo tauri android dev
        ;;
    3)
        echo -e "${GREEN}🤖 Building for Android (Release)...${NC}"
        
        # Check if Android project is initialized
        if [ ! -d "gen/android" ]; then
            echo -e "${YELLOW}⚠️  Android project not initialized. Initializing...${NC}"
            cargo tauri android init
        fi
        
        cargo tauri android build --release
        
        APK_PATH="gen/android/app/build/outputs/apk/release/app-release.apk"
        if [ -f "$APK_PATH" ]; then
            echo -e "${GREEN}✅ APK built successfully!${NC}"
            echo "Location: $APK_PATH"
            
            # Ask if user wants to install
            read -p "Install on connected device? (y/n): " install_choice
            if [ "$install_choice" = "y" ]; then
                adb install -r "$APK_PATH"
            fi
        fi
        ;;
    4)
        if [[ "$OSTYPE" != "darwin"* ]]; then
            echo -e "${RED}❌ iOS builds only work on macOS${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}🍎 Building for iOS (Debug)...${NC}"
        
        # Check if iOS project is initialized
        if [ ! -d "gen/ios" ]; then
            echo -e "${YELLOW}⚠️  iOS project not initialized. Initializing...${NC}"
            cargo tauri ios init
        fi
        
        cargo tauri ios dev
        ;;
    5)
        if [[ "$OSTYPE" != "darwin"* ]]; then
            echo -e "${RED}❌ iOS builds only work on macOS${NC}"
            exit 1
        fi
        
        echo -e "${GREEN}🍎 Building for iOS (Release)...${NC}"
        
        # Check if iOS project is initialized
        if [ ! -d "gen/ios" ]; then
            echo -e "${YELLOW}⚠️  iOS project not initialized. Initializing...${NC}"
            cargo tauri ios init
        fi
        
        cargo tauri ios build --release
        echo -e "${GREEN}✅ iOS build complete! Open Xcode to archive and distribute.${NC}"
        ;;
    6)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac
