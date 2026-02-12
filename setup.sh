#!/bin/bash

echo "🚀 SmartShift - Quick Setup Script"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Check if PostgreSQL is running
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL command not found. Make sure PostgreSQL is installed and running."
    echo ""
fi

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "❌ Backend npm install failed"
    exit 1
fi
echo "✅ Backend dependencies installed"
echo ""

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install
if [ $? -ne 0 ]; then
    echo "❌ Frontend npm install failed"
    exit 1
fi
echo "✅ Frontend dependencies installed"
echo ""

# Setup database
echo "🗄️  Setting up database..."
cd ../backend

echo "Creating database if it doesn't exist..."
createdb smartshift 2>/dev/null || echo "Database might already exist"

echo "Generating Prisma client..."
npm run db:generate
if [ $? -ne 0 ]; then
    echo "❌ Prisma generate failed"
    exit 1
fi

echo "Pushing schema to database..."
npm run db:push
if [ $? -ne 0 ]; then
    echo "❌ Database push failed. Check your DATABASE_URL in backend/.env"
    exit 1
fi

echo "Seeding database with demo data..."
npx tsx prisma/seed.ts
if [ $? -ne 0 ]; then
    echo "❌ Database seed failed"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Start the backend:"
echo "   cd backend && npm run dev"
echo ""
echo "2. In a new terminal, start the frontend:"
echo "   cd frontend && npm run dev"
echo ""
echo "3. Open http://localhost:5173 in your browser"
echo ""
echo "4. Login with demo credentials:"
echo "   Staff:   staff@demo.com / password123"
echo "   Manager: manager@demo.com / password123"
echo ""
echo "✨ Happy building!"
