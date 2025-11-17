#!/bin/bash

# APK Signing Script using apksigner (Android Signature Scheme v2/v3)
# This fixes "APK file is invalid" errors on modern Android devices

set -e

cd "$(dirname "$0")"

KEYSTORE_FILE="ocpp-signing-key.keystore"
KEYSTORE_ALIAS="ocpp-mobile"
KEYSTORE_PASS="android"
KEY_PASS="android"
APK_UNSIGNED="gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
APK_ALIGNED="ocpp-mobile-client-aligned.apk"
APK_SIGNED="ocpp-mobile-client-signed.apk"

echo "🔐 APK Signing Script (Modern Android)"
echo "======================================="
echo ""

# Check if unsigned APK exists
if [ ! -f "$APK_UNSIGNED" ]; then
    echo "❌ Error: Unsigned APK not found at: $APK_UNSIGNED"
    echo "   Please build the APK first with: ./build-android-docker.sh"
    exit 1
fi

# Check if Docker image exists
if ! docker images | grep -q "ocpp-android-builder"; then
    echo "❌ Error: Docker image 'ocpp-android-builder' not found"
    echo "   Please build the Docker image first with: ./build-android-docker.sh"
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
# zipalign optimizes APK for better performance
docker run --rm -v "$(pwd):/app" ocpp-android-builder \
    /opt/android-sdk/build-tools/33.0.0/zipalign -v -p 4 \
    "$APK_UNSIGNED" \
    "$APK_ALIGNED"

echo ""
echo "🔑 Step 2: Signing APK with apksigner (v2/v3 scheme)..."
# apksigner supports modern Android signature schemes
docker run --rm -v "$(pwd):/app" ocpp-android-builder \
    /opt/android-sdk/build-tools/33.0.0/apksigner sign \
    --ks "$KEYSTORE_FILE" \
    --ks-key-alias "$KEYSTORE_ALIAS" \
    --ks-pass pass:"$KEYSTORE_PASS" \
    --key-pass pass:"$KEY_PASS" \
    --out "$APK_SIGNED" \
    "$APK_ALIGNED"

echo ""
echo "✅ Step 3: Verifying signature..."
docker run --rm -v "$(pwd):/app" ocpp-android-builder \
    /opt/android-sdk/build-tools/33.0.0/apksigner verify \
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
