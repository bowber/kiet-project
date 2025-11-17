#!/bin/bash

# APK Signing Script
# This script generates a keystore and signs the APK for installation

set -e

cd "$(dirname "$0")"

KEYSTORE_FILE="ocpp-signing-key.keystore"
KEYSTORE_ALIAS="ocpp-mobile"
APK_UNSIGNED="gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
APK_SIGNED="ocpp-mobile-client-signed.apk"

echo "🔐 APK Signing Script"
echo "===================="
echo ""

# Check if unsigned APK exists
if [ ! -f "$APK_UNSIGNED" ]; then
    echo "❌ Error: Unsigned APK not found at: $APK_UNSIGNED"
    echo "   Please build the APK first with: ./build-android-docker.sh"
    exit 1
fi

# Generate keystore if it doesn't exist
if [ ! -f "$KEYSTORE_FILE" ]; then
    echo "📝 Keystore not found. Creating new keystore..."
    echo ""
    echo "⚠️  You will be asked for:"
    echo "   - Keystore password (remember this!)"
    echo "   - Personal details (can use dummy data for testing)"
    echo ""
    
    keytool -genkey -v \
        -keystore "$KEYSTORE_FILE" \
        -alias "$KEYSTORE_ALIAS" \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass android \
        -keypass android \
        -dname "CN=OCPP Mobile, OU=Development, O=OCPP, L=Unknown, ST=Unknown, C=VN"
    
    echo ""
    echo "✅ Keystore created: $KEYSTORE_FILE"
else
    echo "✅ Using existing keystore: $KEYSTORE_FILE"
fi

echo ""
echo "🔑 Signing APK..."

# Method 1: Try using jarsigner (always available with JDK)
if command -v jarsigner &> /dev/null; then
    echo "   Using jarsigner..."
    
    # Copy unsigned APK
    cp "$APK_UNSIGNED" "$APK_SIGNED"
    
    # Sign with jarsigner
    jarsigner -verbose \
        -sigalg SHA256withRSA \
        -digestalg SHA-256 \
        -keystore "$KEYSTORE_FILE" \
        -storepass android \
        -keypass android \
        "$APK_SIGNED" \
        "$KEYSTORE_ALIAS"
    
    echo ""
    echo "✅ APK signed successfully!"
    echo "📱 Signed APK: $APK_SIGNED"
    echo ""
    echo "📊 APK Details:"
    ls -lh "$APK_SIGNED"
    
    echo ""
    echo "✅ Verifying signature..."
    jarsigner -verify -verbose -certs "$APK_SIGNED" | grep -E "(jar verified|certificate)"
    
else
    echo "❌ Error: jarsigner not found"
    echo "   Please install JDK: sudo apt-get install default-jdk"
    exit 1
fi

echo ""
echo "🎉 Done!"
echo ""
echo "📲 To install on your phone:"
echo "   adb install $APK_SIGNED"
echo ""
echo "   Or transfer the file to your phone and install manually."
echo ""
echo "⚠️  IMPORTANT: Keep $KEYSTORE_FILE safe!"
echo "   You need it to sign updates to your app."
