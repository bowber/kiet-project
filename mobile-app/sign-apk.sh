#!/bin/bash

# APK Signing Script for local development
# Signs the APK using apksigner (modern Android signature scheme v2/v3)

set -e

cd "$(dirname "$0")"

KEYSTORE_FILE="ocpp-signing-key.keystore"
KEYSTORE_ALIAS="ocpp-mobile"
KEYSTORE_PASS="android"
KEY_PASS="android"
APK_UNSIGNED="gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
APK_ALIGNED="ocpp-mobile-client-aligned.apk"
APK_SIGNED="ocpp-mobile-client-signed.apk"

echo "🔐 APK Signing Script"
echo "===================="
echo ""

# Check if unsigned APK exists
if [ ! -f "$APK_UNSIGNED" ]; then
    echo "❌ Error: Unsigned APK not found at: $APK_UNSIGNED"
    echo "   Please build the APK first with: cargo tauri android build"
    exit 1
fi

# Check for ANDROID_HOME or ANDROID_SDK_ROOT
if [ -z "$ANDROID_HOME" ]; then
    if [ -z "$ANDROID_SDK_ROOT" ]; then
        echo "❌ Error: ANDROID_HOME or ANDROID_SDK_ROOT not set"
        echo "   Please set one of them to your Android SDK location"
        exit 1
    else
        ANDROID_SDK="$ANDROID_SDK_ROOT"
    fi
else
    ANDROID_SDK="$ANDROID_HOME"
fi

# Check if build-tools exist
BUILD_TOOLS="$ANDROID_SDK/build-tools/33.0.0"
if [ ! -d "$BUILD_TOOLS" ]; then
    echo "❌ Error: Android build-tools 33.0.0 not found at: $BUILD_TOOLS"
    echo "   Please install with: sdkmanager 'build-tools;33.0.0'"
    exit 1
fi

# Generate keystore if it doesn't exist
if [ ! -f "$KEYSTORE_FILE" ]; then
    echo "📝 Keystore not found. Creating new keystore..."
    echo ""
    
    keytool -genkey -v \
        -keystore "$KEYSTORE_FILE" \
        -alias "$KEYSTORE_ALIAS" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass "$KEYSTORE_PASS" \
        -keypass "$KEY_PASS" \
        -dname "CN=OCPP Mobile, OU=Development, O=OCPP, L=Unknown, ST=Unknown, C=VN"
    
    echo ""
    echo "✅ Keystore created: $KEYSTORE_FILE"
else
    echo "✅ Using existing keystore: $KEYSTORE_FILE"
fi

echo ""
echo "🔧 Step 1: Aligning APK..."
$BUILD_TOOLS/zipalign -v -p 4 \
    "$APK_UNSIGNED" \
    "$APK_ALIGNED"

echo ""
echo "🔑 Step 2: Signing APK with apksigner (v2/v3 scheme)..."
$BUILD_TOOLS/apksigner sign \
    --ks "$KEYSTORE_FILE" \
    --ks-key-alias "$KEYSTORE_ALIAS" \
    --ks-pass pass:"$KEYSTORE_PASS" \
    --key-pass pass:"$KEY_PASS" \
    --out "$APK_SIGNED" \
    "$APK_ALIGNED"

echo ""
echo "✅ Step 3: Verifying signature..."
$BUILD_TOOLS/apksigner verify \
    --verbose "$APK_SIGNED"

# Clean up aligned APK
rm -f "$APK_ALIGNED"

echo ""
echo "🎉 Done!"
echo ""
echo "📱 Signed APK: $APK_SIGNED"
ls -lh "$APK_SIGNED"
echo ""
echo "📲 To install on your phone:"
echo "   adb install $APK_SIGNED"
echo ""
echo "   Or transfer the file to your phone and install manually."
echo ""
echo "✅ This APK uses Android Signature Scheme v2/v3"
echo "   It will work on all modern Android devices!"
echo ""
echo "⚠️  IMPORTANT: Keep $KEYSTORE_FILE safe!"
echo "   You need it to sign updates to your app."
