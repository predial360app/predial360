#!/bin/bash
# LocalStack — Criação de recursos AWS para desenvolvimento
set -e

echo "==> Criando bucket S3: predial360-dev"
awslocal s3 mb s3://predial360-dev --region us-east-1

# Configurar CORS no bucket
awslocal s3api put-bucket-cors \
  --bucket predial360-dev \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["http://localhost:3001", "http://localhost:19006"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }]
  }'

echo "==> Bucket S3 criado e configurado."
echo "==> LocalStack pronto para uso."
