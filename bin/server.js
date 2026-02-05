#!/usr/bin/env node

/**
 * HumanAgent MCP Server 启动脚本
 * 
 * 使用方式:
 *   npx humanagent-mcp
 *   
 * 环境变量:
 *   HUMANAGENT_SERVER_URL - 后端服务器地址 (默认: http://localhost:8000)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 导入并启动服务
import(join(__dirname, '../dist/index.js')).catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
