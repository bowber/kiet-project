#!/bin/bash

# Android SDK Setup Script
# This script will install Android SDK and build the APK

set -e

echo "🤖 Android SDK Setup and Build Script"
echo "======================================"
echo ""

ANDROID_HOME="$HOME/Android/Sdk"
PROJECT_DIR="/home/bowber/projects/kiet-project/mobile-app"

# Step 1: Extract and setup command line tools
echo "📦 Step 1: Setting up Android SDK..."
cd "$HOME/Android/Sdk"
if [ -f "cmdline-tools.zip" ]; then
    unzip -q cmdline-tools.zip
    mkdir -p cmdline-tools/latest
    mv cmdline-tools/{bin,lib,NOTICE.txt,source.properties} cmdline-tools/latest/ 2>/dev/null || true
    rm cmdline-tools.zip
    echo "✅ Command line tools extracted"
else
    echo "❌ cmdline-tools.zip not found. Please download first."
    exit 1
fi

# Step 2: Set environment variables
echo ""
echo "📝 Step 2: Setting environment variables..."
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
echo "✅ Environment variables set"

# Step 3: Accept licenses
echo ""
echo "📜 Step 3: Accepting Android SDK licenses..."
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses 2>&1 | head -20

# Step 4: Install required components
echo ""
echo "📥 Step 4: Installing Android SDK components..."
echo "This may take 5-10 minutes..."
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.0" "ndk;25.2.9519653"
echo "✅ SDK components installed"

# Step 5: Set NDK_HOME
echo ""
echo "🔧 Step 5: Setting NDK_HOME..."
export NDK_HOME="$ANDROID_HOME/ndk/25.2.9519653"
echo "✅ NDK_HOME set to $NDK_HOME"

# Step 6: Install Rust Android targets
echo ""
echo "🦀 Step 6: Installing Rust Android targets..."
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi  
rustup target add x86_64-linux-android
rustup target add i686-linux-android
echo "✅ Rust targets installed"

# Step 7: Initialize Tauri Android project
echo ""
echo "🚀 Step 7: Initializing Tauri Android project..."
cd "$PROJECT_DIR"
cargo tauri android init
echo "✅ Android project initialized"

# Step 8: Build APK
echo ""
echo "📱 Step 8: Building Android APK..."
echo "This may take 5-10 minutes for the first build..."
cargo tauri android build

# Step 9: Show results
echo ""
echo "🎉 BUILD COMPLETE!"
echo "=================="
echo ""
APK_PATH="$PROJECT_DIR/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
if [ -f "$APK_PATH" ]; then
    echo "✅ APK Location: $APK_PATH"
    ls -lh "$APK_PATH"
    echo ""
    echo "📲 To install on device:"
    echo "   adb install $APK_PATH"
else
    echo "❌ APK not found. Check build output above for errors."
fi

echo ""
echo "💡 To add to your shell permanently, add these to ~/.bashrc:"
echo "   export ANDROID_HOME=$HOME/Android/Sdk"
echo "   export NDK_HOME=\$ANDROID_HOME/ndk/25.2.9519653"
echo "   export PATH=\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools"
