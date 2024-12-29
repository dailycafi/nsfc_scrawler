#!/bin/bash

# 构建镜像
docker-compose build

# 启动容器
docker-compose up -d

# 显示日志
docker-compose logs -f 