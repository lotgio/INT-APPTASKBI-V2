#!/bin/bash

# Deploy script per Azure
echo "Building frontend..."
npm ci
npm run build

echo "Copying files..."
cp public/jobs.json dist/jobs.json

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo "Deploy completed!"
