# 使用多阶段构建，指定 linux/amd64 平台
FROM --platform=linux/amd64 node:18-slim

# 安装 Chromium 和必要依赖
RUN apt-get update \
    && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-symbola \
    fonts-noto \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制项目文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 设置 Puppeteer 环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 创建数据目录
RUN mkdir -p /app/data

# 设置容器时区为中国时区
ENV TZ=Asia/Shanghai

# 设置 Node 运行环境
ENV NODE_ENV=production

# 启动命令
CMD ["node", "src/index.js"] 