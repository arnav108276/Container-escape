#!/usr/bin/env pwsh
# Populate the Container Escape Detection dashboard with all running containers

param(
    [string]$BackendUrl = "http://localhost:8000"
)

Write-Host "Finding all running containers..." -ForegroundColor Cyan

# Get all running containers from Docker
$containers = docker ps --no-trunc --format "json" | ConvertFrom-Json

Write-Host "Found $($containers.Count) containers" -ForegroundColor Green

# Transform to the format expected by backend
$containerData = @()
foreach ($container in $containers) {
    $containerData += @{
        container_id = $container.ID.Substring(0, 12)
        full_id = $container.ID
        name = $container.Names
        image = $container.Image
        status = "running"
        quarantined = $false
        risk_level = "low"
        alert_count = 0
    }
}

Write-Host "Sending containers to backend..." -ForegroundColor Cyan

# Send to backend API
try {
    $payload = @{ containers = $containerData }
    $jsonPayload = $payload | ConvertTo-Json
    
    $response = Invoke-WebRequest `
        -Uri "$BackendUrl/api/containers/sync" `
        -Method POST `
        -ContentType "application/json" `
        -Body $jsonPayload `
        -UseBasicParsing

    Write-Host "Successfully synced $($containerData.Count) containers!" -ForegroundColor Green
    Write-Host "Refresh your dashboard at http://localhost:5173" -ForegroundColor Green
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "Make sure the backend is running at $BackendUrl" -ForegroundColor Yellow
}
