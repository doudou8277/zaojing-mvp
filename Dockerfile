# 造境 ZaoJing Dockerfile
# 多阶段构建：builder 打包前端 + 安装后端依赖，runtime 运行服务

# ========== Builder 阶段：前端构建 ==========
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 复制前端 package.json 和 lock 文件
COPY package*.json ./

# 安装前端依赖（使用 npm ci 保证构建可复现性）
RUN npm ci

# 复制前端源码（public/ 目录可选，不存在时跳过）
COPY index.html vite.config.js tsconfig.json ./
COPY js/ ./js/
COPY css/ ./css/

# 构建前端
RUN npm run build

# ========== Builder 阶段：后端依赖 ==========
FROM node:20-alpine AS backend-builder

WORKDIR /app/server

# 复制后端 package.json 和 lock 文件
COPY server/package*.json ./

# 安装后端生产依赖（使用 npm ci 保证构建可复现性）
RUN npm ci --production

# ========== Runtime 阶段 ==========
FROM node:20-alpine AS runtime

WORKDIR /app/server

# 从 backend-builder 复制 node_modules
COPY --from=backend-builder /app/server/node_modules ./node_modules

# 复制后端源码
COPY server/ ./

# 从 frontend-builder 复制构建产物
COPY --from=frontend-builder /app/dist /app/dist

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8127
ENV STATIC_DIR=/app/dist

# 创建数据目录并设置正确权限（必须在 USER node 之前执行）
RUN mkdir -p generated gallery data && chown -R node:node generated gallery data

# 暴露端口
EXPOSE 8127

# 健康检查（使用 Node.js 内置 http 模块，避免依赖 wget/curl，alpine 镜像不含 wget）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||8127)+'/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))" || exit 1

# 使用非 root 用户运行
USER node

# 启动命令
CMD ["node", "server.js"]
