#!/bin/bash

# Quick Start Script - OCPP Mobile App
# This script helps you get started quickly

echo "=========================================="
echo "  OCPP Mobile App - Quick Start"
echo "=========================================="
echo ""

# Check if running from correct directory
if [ ! -f "Cargo.toml" ]; then
    echo "❌ Error: Please run this script from the mobile-app directory"
    echo "   cd mobile-app && ./quickstart.sh"
    exit 1
fi

# Check Rust installation
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not found. Please install Rust from https://rustup.rs/"
    exit 1
fi

echo "✅ Rust installed: $(rustc --version)"
echo ""

# Check/Install Tauri CLI
if ! command -v cargo-tauri &> /dev/null; then
    echo "⚠️  Tauri CLI not found. Installing..."
    cargo install tauri-cli --version "^2.0.0"
    echo ""
fi

echo "✅ Tauri CLI ready"
echo ""

# Ask what to do
echo "What would you like to do?"
echo ""
echo "1) Test on Desktop (Recommended first step)"
echo "2) Setup for Android"
echo "3) Setup for iOS (macOS only)"
echo "4) View full documentation"
echo "5) Exit"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Launching desktop version..."
        echo "This will compile and run the app in a desktop window."
        echo "Use this to test functionality before building for mobile."
        echo ""
        read -p "Press Enter to continue..."
        cargo tauri dev
        ;;
    2)
        echo ""
        echo "📱 Android Setup Guide"
        echo "====================="
        echo ""
        echo "Requirements:"
        echo "1. Android Studio with SDK (API 24+)"
        echo "2. Android NDK"
        echo "3. Java JDK 17"
        echo ""
        echo "Setup steps:"
        echo ""
        echo "1) Install Android Studio from:"
        echo "   https://developer.android.com/studio"
        echo ""
        echo "2) Install SDK and NDK via Android Studio:"
        echo "   Tools → SDK Manager → SDK Platforms (API 24+)"
        echo "   Tools → SDK Manager → SDK Tools → NDK (Side by side)"
        echo ""
        echo "3) Set environment variables (add to ~/.bashrc):"
        echo "   export ANDROID_HOME=\$HOME/Android/Sdk"
        echo "   export NDK_HOME=\$ANDROID_HOME/ndk/\$(ls -1 \$ANDROID_HOME/ndk | sort -V | tail -n 1)"
        echo ""
        echo "4) Install Rust targets:"
        echo "   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android"
        echo ""
        echo "5) Initialize and build:"
        echo "   cargo tauri android init"
        echo "   cargo tauri android dev"
        echo ""
        read -p "Press Enter to continue..."
        ;;
    3)
        if [[ "$OSTYPE" != "darwin"* ]]; then
            echo "❌ iOS development only works on macOS"
            exit 1
        fi
        
        echo ""
        echo "🍎 iOS Setup Guide"
        echo "=================="
        echo ""
        echo "Requirements:"
        echo "1. Xcode (from App Store)"
        echo "2. Xcode Command Line Tools"
        echo "3. Apple Developer Account (for device testing)"
        echo ""
        echo "Setup steps:"
        echo ""
        echo "1) Install Xcode from App Store"
        echo ""
        echo "2) Install command line tools:"
        echo "   xcode-select --install"
        echo ""
        echo "3) Install Rust targets:"
        echo "   rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim"
        echo ""
        echo "4) Initialize and build:"
        echo "   cargo tauri ios init"
        echo "   cargo tauri ios dev"
        echo ""
        read -p "Press Enter to continue..."
        ;;
    4)
        echo ""
        echo "📖 Documentation Files"
        echo "====================="
        echo ""
        echo "Available documentation:"
        echo "- README.md - Complete technical documentation"
        echo "- QUICKSTART.md - Step-by-step setup guide"  
        echo "- CONVERSION_COMPLETE.md - Overview of the conversion"
        echo "- DEPLOYMENT_CHECKLIST.md - Pre-deployment checklist"
        echo ""
        read -p "Which file would you like to view? (press Enter to skip): " doc_file
        if [ ! -z "$doc_file" ]; then
            if [ -f "$doc_file" ]; then
                less "$doc_file"
            else
                echo "File not found: $doc_file"
            fi
        fi
        ;;
    5)
        echo "Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "For more help, check README.md or QUICKSTART.md"
echo "Or run: ./build.sh for interactive builds"
echo "=========================================="
