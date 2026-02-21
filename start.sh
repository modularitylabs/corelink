#!/bin/bash

echo "🔗 CoreLink - Starting servers..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo ""
    echo "📝 Please edit .env and add your Gmail OAuth credentials:"
    echo "   - GMAIL_CLIENT_ID"
    echo "   - GMAIL_CLIENT_SECRET"
    echo ""
    echo "See SETUP.md for detailed instructions."
    exit 1
fi

# Build packages
echo "📦 Building packages..."
npm run build

echo ""
echo "✅ Build complete!"
echo ""
echo "🚀 To start CoreLink:"
echo ""
echo "   Terminal 1: npm run dev -w @corelink/gateway"
echo "   Terminal 2: npm run dev -w @corelink/web"
echo ""
echo "   Then visit: http://localhost:5173"
echo ""
