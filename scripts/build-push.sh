#!/bin/bash

# 设置变量
IMAGE_NAME="你的镜像名称"
IMAGE_TAG="latest"
REGISTRY="你的镜像仓库地址"  

# 构建支持 amd64 架构的镜像
docker buildx build \
  --platform linux/amd64 \
  -t ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG} \
  --push \
  .

echo "镜像已构建并推送到: ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}" 