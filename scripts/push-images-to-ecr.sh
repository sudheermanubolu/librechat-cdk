#!/bin/bash
set -e

# Configuration
AWS_REGION="${AWS_REGION:-eu-north-1}"
AWS_PROFILE="${AWS_PROFILE:-vestransfers}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile $AWS_PROFILE --query Account --output text)

# Source images
LIBRECHAT_SOURCE="ghcr.io/danny-avila/librechat:latest"
MEILISEARCH_SOURCE="getmeili/meilisearch:v1.12.3"
RAG_API_SOURCE="ghcr.io/danny-avila/librechat-rag-api-dev:latest"

# ECR repository URIs
ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
LIBRECHAT_TARGET="${ECR_BASE}/librechat/librechat:latest"
MEILISEARCH_TARGET="${ECR_BASE}/librechat/meilisearch:v1.12.3"
RAG_API_TARGET="${ECR_BASE}/librechat/rag-api:latest"

echo "=== Pushing images to ECR ==="
echo "AWS Account: ${AWS_ACCOUNT_ID}"
echo "AWS Region: ${AWS_REGION}"
echo ""

# Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} --profile ${AWS_PROFILE} | \
    docker login --username AWS --password-stdin ${ECR_BASE}

# Function to pull, tag, and push image
push_image() {
    local source=$1
    local target=$2
    local name=$3

    echo ""
    echo "=== Processing ${name} ==="
    echo "Source: ${source}"
    echo "Target: ${target}"

    echo "Pulling ${source}..."
    docker pull ${source} --platform linux/arm64

    echo "Tagging as ${target}..."
    docker tag ${source} ${target}

    echo "Pushing to ECR..."
    docker push ${target}

    echo "${name} pushed successfully!"
}

# Push all images
push_image "${LIBRECHAT_SOURCE}" "${LIBRECHAT_TARGET}" "LibreChat"
push_image "${MEILISEARCH_SOURCE}" "${MEILISEARCH_TARGET}" "Meilisearch"
push_image "${RAG_API_SOURCE}" "${RAG_API_TARGET}" "RAG API"

echo ""
echo "=== All images pushed successfully! ==="
echo ""
echo "Update your config/config.local.json with:"
echo "  libreChatImage.repository: ${ECR_BASE}/librechat/librechat"
echo "  meiliSearchImage.repository: ${ECR_BASE}/librechat/meilisearch"
echo "  ragAPIImage.repository: ${ECR_BASE}/librechat/rag-api"
