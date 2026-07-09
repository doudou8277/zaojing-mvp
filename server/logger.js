/**
 * 造境 ZaoJing 结构化日志模块
 * 基于 Pino，开发环境美化输出，生产环境 JSON 结构化
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  base: {
    service: 'zaojing-server',
    version: '1.0.0'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // 脱敏：防止 API Key、Token、base64 图片数据写入日志
  redact: {
    paths: [
      'req.headers["x-api-key"]',
      'req.headers["x-admin-token"]',
      'req.headers.authorization',
      'apiKey',
      'apiKeyAuth',
      'adminToken',
      'VOLCENGINE_API_KEY',
      'TMDB_API_KEY',
      'API_KEY',
      'ADMIN_TOKEN',
      '*.imageBase64',
      '*.imageBase64.length',
      'imageBase64',
      'req.body.imageBase64'
    ],
    censor: '[REDACTED]'
  },
  ...(isProduction
    ? {} // 生产环境：纯 JSON 输出，便于日志聚合
    : {
        // 开发环境：彩色美化输出
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname,service,version',
            messageFormat: '{msg}'
          }
        }
      })
});

module.exports = logger;
