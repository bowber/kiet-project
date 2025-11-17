#!/bin/bash

# Docker-based Android APK Build Script

set -e

echo "🐳 Building Android APK using Docker"
echo "====================================="
echo ""

cd "$(dirname "$0")"

# Build the Docker image
echo "📦 Step 1: Building Docker image with all Android tools..."
docker build -f Dockerfile.android -t ocpp-android-builder . 

# Run the build
echo ""
echo "🔨 Step 2: Building APK inside Docker container..."
docker run --rm -v "$(pwd):/app" ocpp-android-builder

# Copy APK to current directory
echo ""
echo "📋 Step 3: Copying APK to current directory..."
docker run --rm -v "$(pwd):/app" ocpp-android-builder sh -c "cp gen/android/app/build/outputs/apk/universal/release/*.apk /app/ocpp-mobile-client.apk 2>/dev/null || cp gen/android/app/build/outputs/apk/*/release/*.apk /app/ocpp-mobile-client.apk 2>/dev/null || echo 'APK copy failed'"

if [ -f "ocpp-mobile-client.apk" ]; then
    echo ""
    echo "🎉 SUCCESS!"
    echo "==========="
    echo ""
    echo "✅ APK built successfully!"
    echo "📱 Location: $(pwd)/ocpp-mobile-client.apk"
    echo "📊 Size: $(du -h ocpp-mobile-client.apk | cut -f1)"
    echo ""
    echo "📲 To install on device:"
    echo "   adb install ocpp-mobile-client.apk"
else
    echo ""
    echo "⚠️  APK file not found in expected location."
    echo "Searching for APK files..."
    docker run --rm -v "$(pwd):/app" ocpp-android-builder find gen/android -name "*.apk" -type f
fi
