#!/bin/bash

echo "🚀 Deploying 56 Card Game"
echo "========================="
echo ""

#Build common package
echo "🏠 Building common package..."
cd packages/common && npm run build
if [ $? -ne 0 ]; then
  echo "X Common build failed"
  exit 1
fi
cd ../..

# Build server
echo "🏠 Building server..."
cd packages/game-server && npm run build
if [ $? -ne 0 ]; then
  echo "❌ Server build failed"
  exit 1
fi
cd ../..

#Build client
echo "🏠 Building client..."
cd packages/web && npm run build
if [ $? -ne 0 ]; then
  echo "❌ Client build failed"
  exit 1
fi
cd ../..

#Copy client build to server
echo "📖 Copying client to server..."
rm -rf packages/game-server/client/*
cp -r packages/web/build/* packages/game-server/client/

echo ""
echo "✅ Build complete!"
echo "📦 Ready for deployment"
echo ""
echo "Next steps:"
echo "1. Push to Github: git add . && git commit -m 'Deploy' && git push"
echo "2. Deploy to Render: Will auto-deploy from Github"
echo "3. Or deploy to Railway/Fly.io - see DEPLOYMENT.md"