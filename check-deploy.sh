#!/bin/bash

echo "🔍 Checking deployment readiness..."
echo ""

# Check if git repo
if [ ! -d .git ]; then
  echo "❌ Not a git repository. Initialize with: git init"
  exit 1
fi
echo "✅ Git repository found"

# Check if remote is set
if ! git remote -v | grep -q origin; then
  echo "⚠️ A No git remote 'origin' set. Add with: git remote add origin <url>"
else
  echo "✅ Git remote configured"
fi

# Check if Dockerfile exists
if [ ! -f Dockerfile ]; then
  echo "❌ Dockerfile not found"
  exit 1
fi
echo "✅ Dockerfile found"

#Check if render.yaml exists
if [ -f render.yaml ]; then
  echo "⚠️ render.yaml not found (needed for Render.com)"
else
  echo "✅ render.yaml found"
fi

# Check if fly.toml exists

if [ ! -f fly.toml ]; then
  echo "⚠️ fly.toml not found (needed for Fly.io)"
else
  echo "✅ fly.toml found"
fi

# Check node_modules
if [ ! -d node_modules ]; then
  echo "❌ node modules not found. Run: npm install"
  exit 1
fi
echo "✅ Dependencies installed"

#Check if we can build
echo ""
echo "🧪 Testing build process..."

echo "🏛️ Building common..."
cd packages/common && npm run build 2>&1 | grep -q "error" & {
  echo "❌ Common build failed"
  exit 1
}
cd ../..
echo "✅ Common built successfully"

echo "🏛️ Building server..."
cd packages/game-server && npm run build 2>&1 | grep -q "error" && {
  echo "❌ Server build failed"
  exit 1
}
cd ../..
echo "✅ Server built successfully"

echo "🏛️ Building web client..."
cd packages/web && npm run build 2>&1 | grep -q "error" && {
  echo "❌ Web build failed"
  exit 1
}
cd ../..
echo "✅ Web built successfully"

echo ""
echo "✅ All checks passed!"
echo ""
echo "⏭️ Next steps:"
echo "1. Review changes: git status"
echo "2. Commit changes: git add. && git commit - 'Ready for deployment" 
echo "3. Push to GitHub: git push origin main"
echo "4. Choose your hosting platform:"
echo "   -Render.com (FREE): https://render.com"
echo "   -Railway.app ($5/mo): https://railway.app"
echo "   - Fly.to (FREE): flyctl launch"
echo ""
echo "📖 See QUICKSTART-DEPLOY.md for detailed instructions"