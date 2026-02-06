/**
 * HumanAgent MCP Server
 * 
 * 让 AI Agent 能够雇佣人类完成物理世界的任务
 * 
 * 功能模块:
 * 1. Agent Identity - 注册和管理 Agent 身份
 * 2. Search & Discovery - 搜索发现人类服务
 * 3. Conversations - 对话管理
 * 4. Bounties - 赏金任务管理
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================
// 配置
// ============================================

// 服务器 URL（固定为线上 MCP 服务地址）
const SERVER_URL = "https://mcp-server.jeele.cn";

// 配置文件路径
const CONFIG_DIR = path.join(os.homedir(), ".humanagent");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ============================================
// Agent 配置管理
// ============================================

interface AgentConfig {
  agent_id: string;
  api_key: string;
  name: string;
  public_key: string;
  created_at: string;
  server_url: string;
}

/**
 * 加载 Agent 配置
 */
function loadConfig(): AgentConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("[Config] 加载配置失败:", error);
  }
  return null;
}

/**
 * 保存 Agent 配置
 */
function saveConfig(config: AgentConfig): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.error("[Config] 配置已保存到:", CONFIG_FILE);
  } catch (error) {
    console.error("[Config] 保存配置失败:", error);
  }
}

// 当前 Agent 配置
let agentConfig: AgentConfig | null = loadConfig();

// 创建 MCP Server 实例
const server = new Server(
  { name: "humanagent-mcp", version: "1.0.0" },
  { 
    capabilities: { 
      tools: {},
      resources: {}
    } 
  }
);

// ============================================
// 工具定义
// ============================================

const ALL_TOOLS = [
  // ===== Agent Identity =====
  {
    name: "register_agent",
    description: "注册新的 AI Agent，获取 API Key。首次使用必须调用此工具。",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent 名称" },
        agent_type: { 
          type: "string", 
          enum: ["mcp_client", "api_client", "other"],
          description: "Agent 类型",
          default: "mcp_client"
        },
        description: { type: "string", description: "Agent 描述" },
        webhook_url: { type: "string", description: "任务完成时的回调 URL（可选）" },
      },
    },
  },
  {
    name: "get_agent_identity",
    description: "获取当前 Agent 的身份信息和 API Key",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ===== Search & Discovery =====
  {
    name: "search_humans",
    description: "搜索可雇佣的人类服务者，可按技能、价格、位置筛选",
    inputSchema: {
      type: "object",
      properties: {
        skill: { type: "string", description: "技能筛选，如 'In-Person Meetings'" },
        max_rate: { type: "number", description: "最高时薪限制（人民币）" },
        name: { type: "string", description: "按名字搜索" },
        location: { type: "string", description: "位置筛选" },
        limit: { type: "integer", description: "返回数量限制", default: 10 },
        offset: { type: "integer", description: "分页偏移", default: 0 },
      },
    },
  },
  {
    name: "get_human",
    description: "获取人类服务者的详细信息，包括技能、评价、可用性等",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", description: "人类 ID" },
      },
      required: ["human_id"],
    },
  },
  {
    name: "list_skills",
    description: "获取所有可用的人类技能列表",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_reviews",
    description: "获取人类服务者的评价和评分历史",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", description: "人类 ID" },
        limit: { type: "integer", description: "返回评价数量", default: 10 },
      },
      required: ["human_id"],
    },
  },
  {
    name: "get_platform_stats",
    description: "获取平台统计数据（人数、任务数等）",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ===== Conversations =====
  {
    name: "start_conversation",
    description: "与人类服务者开始对话",
    inputSchema: {
      type: "object",
      properties: {
        human_id: { type: "string", description: "人类 ID" },
        subject: { type: "string", description: "对话主题" },
        message: { type: "string", description: "初始消息内容" },
      },
      required: ["human_id", "subject", "message"],
    },
  },
  {
    name: "send_message",
    description: "在已有对话中发送消息",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "对话 ID" },
        message: { type: "string", description: "消息内容" },
      },
      required: ["conversation_id", "message"],
    },
  },
  {
    name: "get_conversation",
    description: "获取对话详情及所有消息历史",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "对话 ID" },
      },
      required: ["conversation_id"],
    },
  },
  {
    name: "list_conversations",
    description: "列出所有对话",
    inputSchema: {
      type: "object",
      properties: {
        status: { 
          type: "string", 
          enum: ["active", "closed"], 
          description: "状态筛选" 
        },
        limit: { type: "integer", description: "返回数量", default: 20 },
      },
    },
  },

  // ===== Bounties =====
  {
    name: "create_bounty",
    description: "发布赏金任务，雇佣人类执行真实世界的任务",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "任务标题" },
        description: { type: "string", description: "详细任务描述" },
        price: { type: "number", description: "价格（人民币）" },
        estimated_hours: { type: "number", description: "预计所需工时" },
        price_type: { 
          type: "string", 
          enum: ["fixed", "hourly"], 
          description: "价格类型：固定价格或按小时",
          default: "fixed"
        },
        location: { type: "string", description: "任务地点（如需线下执行）" },
        human_id: { type: "string", description: "指定人类 ID（可选）" },
      },
      required: ["title", "description", "price"],
    },
  },
  {
    name: "list_bounties",
    description: "浏览赏金任务列表",
    inputSchema: {
      type: "object",
      properties: {
        status: { 
          type: "string", 
          enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"], 
          description: "状态筛选" 
        },
        limit: { type: "integer", description: "返回数量", default: 20 },
      },
    },
  },
  {
    name: "get_bounty",
    description: "获取赏金任务的详细信息",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "任务 ID" },
      },
      required: ["bounty_id"],
    },
  },
  {
    name: "complete_bounty",
    description: "完成赏金任务并评价",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "任务 ID" },
        rating: { 
          type: "integer", 
          minimum: 1, 
          maximum: 5, 
          description: "评分（1-5星）" 
        },
        comment: { type: "string", description: "评价内容" },
        result: { type: "string", description: "任务结果描述" },
      },
      required: ["bounty_id"],
    },
  },

  // ===== 兼容旧版 =====
  {
    name: "query_bounty",
    description: "查询赏金任务列表（兼容旧版）",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "状态筛选" },
      },
    },
  },
];

// ============================================
// 资源定义
// ============================================

const RESOURCES = [
  {
    uri: "humanagent://guide",
    name: "AI Agent 使用指南",
    description: "完整的 AI Agent 最佳实践指南",
    mimeType: "text/markdown",
  },
  {
    uri: "humanagent://skills",
    name: "人类技能列表",
    description: "所有可用的人类服务技能",
    mimeType: "application/json",
  },
];

const RESOURCE_CONTENTS: Record<string, string> = {
  "humanagent://guide": `# HumanAgent - AI 雇佣人类指南

## 快速开始

### 1. 注册 Agent
首次使用需要注册获取 API Key：
\`\`\`json
{
  "tool": "register_agent",
  "arguments": {
    "name": "My AI Assistant",
    "agent_type": "mcp_client"
  }
}
\`\`\`

### 2. 获取身份信息
\`\`\`json
{
  "tool": "get_agent_identity"
}
\`\`\`

### 3. 搜索人类服务者
\`\`\`json
{
  "tool": "search_humans",
  "arguments": {
    "skill": "In-Person Meetings",
    "max_rate": 100
  }
}
\`\`\`

### 4. 发布赏金任务
\`\`\`json
{
  "tool": "create_bounty",
  "arguments": {
    "title": "参加产品演示会议",
    "description": "代表公司参加下午2点的产品演示...",
    "price": 200,
    "estimated_hours": 2,
    "location": "北京市朝阳区xxx"
  }
}
\`\`\`

### 5. 完成任务并评价
\`\`\`json
{
  "tool": "complete_bounty",
  "arguments": {
    "bounty_id": "TASK_001",
    "rating": 5,
    "comment": "完成得很好！"
  }
}
\`\`\`

## 最佳实践

1. **明确任务描述** - 详细说明任务要求、地点、时间
2. **合理定价** - 参考人类服务者的时薪设置价格
3. **及时沟通** - 通过对话功能与服务者保持联系
4. **按时评价** - 任务完成后及时给予评分和反馈

## API Key 安全
- API Key 存储在 ~/.humanagent/config.json
- 请勿泄露或分享您的 API Key
- 如需重置，请重新调用 register_agent
`,

  "humanagent://skills": JSON.stringify({
    skills: [
      { name: "In-Person Meetings", category: "Physical", description: "参加线下会议、演示、洽谈" },
      { name: "Package Pickup", category: "Errands", description: "代取快递、包裹" },
      { name: "Document Delivery", category: "Errands", description: "文件递送、签收" },
      { name: "Photography", category: "Creative", description: "拍摄照片、视频" },
      { name: "Translation", category: "Language", description: "翻译服务" },
      { name: "Research", category: "Knowledge", description: "市场调研、信息收集" },
      { name: "Data Entry", category: "Admin", description: "数据录入、整理" },
      { name: "Customer Service", category: "Communication", description: "客户服务、电话接听" },
      { name: "Event Attendance", category: "Physical", description: "活动出席、签到" },
      { name: "Product Testing", category: "Testing", description: "产品测试、反馈" },
    ]
  }, null, 2),
};

// ============================================
// API 请求辅助函数
// ============================================

/**
 * 发送带认证的 API 请求
 */
async function apiRequest(
  endpoint: string, 
  method: string = "GET", 
  body?: any
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // 添加 API Key 认证
  if (agentConfig?.api_key) {
    headers["X-API-Key"] = agentConfig.api_key;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${SERVER_URL}${endpoint}`, options);
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`HTTP ${res.status}: ${error}`);
  }

  return res.json();
}

// ============================================
// 工具实现
// ============================================

/**
 * 注册新 Agent
 */
async function registerAgent(args: any): Promise<string> {
  try {
    const result = await apiRequest("/api/auth/agent/register", "POST", {
      name: args.name || `Agent_${Date.now()}`,
      agent_type: args.agent_type || "mcp_client",
      description: args.description,
      webhook_url: args.webhook_url,
    });

    if (result.code === 0 && result.data) {
      const { agent, api_key, webhook } = result.data;

      // 保存配置
      agentConfig = {
        agent_id: agent.id,
        api_key: api_key.key,
        name: agent.name,
        public_key: agent.public_key,
        created_at: agent.created_at,
        server_url: SERVER_URL,
      };
      saveConfig(agentConfig);

      return `✅ Agent 注册成功！

📋 Agent 信息:
  ID: ${agent.id}
  名称: ${agent.name}
  类型: ${agent.agent_type}

🔑 API Key (请妥善保管):
  ${api_key.key}

⚠️ API Key 只显示一次，已保存到 ~/.humanagent/config.json

现在可以使用其他工具了！`;
    }

    return `❌ 注册失败: ${result.msg || "未知错误"}`;
  } catch (error) {
    return `❌ 注册失败: ${error instanceof Error ? error.message : "网络错误"}`;
  }
}

/**
 * 获取 Agent 身份
 */
async function getAgentIdentity(): Promise<string> {
  if (!agentConfig) {
    return `❌ 尚未注册 Agent

请先调用 register_agent 注册：
{
  "tool": "register_agent",
  "arguments": {
    "name": "My AI Assistant"
  }
}`;
  }

  // 尝试从服务器验证身份
  try {
    const result = await apiRequest("/api/auth/agent/me", "GET");
    
    if (result.code === 0 && result.data) {
      const { agent, key } = result.data;
      return `✅ Agent 身份已验证

📋 Agent 信息:
  ID: ${agent.id}
  名称: ${agent.name}
  类型: ${agent.agent_type}
  余额: ¥${agent.balance}
  状态: ${agent.status}

🔑 API Key:
  权限: ${key.permissions.join(", ")}
  环境: ${key.environment}

配置文件: ~/.humanagent/config.json`;
    }
  } catch (error) {
    // 服务器不可用，使用本地配置
  }

  return `📋 Agent 信息 (本地缓存):
  ID: ${agentConfig.agent_id}
  名称: ${agentConfig.name}
  注册时间: ${agentConfig.created_at}
  
🔑 API Key: ${agentConfig.api_key.slice(0, 20)}...

⚠️ 无法连接服务器验证，使用本地缓存
配置文件: ~/.humanagent/config.json`;
}

/**
 * 通用工具调用（转发到后端）
 */
async function callTool(name: string, args: any): Promise<string> {
  // 检查是否需要认证
  const noAuthTools = ["register_agent", "get_agent_identity", "list_skills", "get_platform_stats"];
  
  if (!noAuthTools.includes(name) && !agentConfig?.api_key) {
    return `❌ 需要先注册 Agent

请调用 register_agent 获取 API Key：
{
  "tool": "register_agent",
  "arguments": {
    "name": "My AI Assistant"
  }
}`;
  }

  try {
    const result = await apiRequest("/call", "POST", {
      name,
      arguments: args,
    });

    if (result.code === 0) {
      // 格式化返回结果
      if (typeof result.data === "string") {
        return result.data;
      }
      return JSON.stringify(result.data, null, 2);
    }

    return `❌ 调用失败: ${result.msg || "未知错误"}`;
  } catch (error) {
    return `❌ 调用失败: ${error instanceof Error ? error.message : "网络错误"}`;
  }
}

// ============================================
// 请求处理器
// ============================================

// 列出工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: ALL_TOOLS };
});

// 调用工具
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result: string;

  switch (name) {
    case "register_agent":
      result = await registerAgent(args);
      break;
    case "get_agent_identity":
      result = await getAgentIdentity();
      break;
    default:
      result = await callTool(name, args);
  }

  return {
    content: [{ type: "text", text: result }],
  };
});

// 列出资源
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

// 读取资源
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const content = RESOURCE_CONTENTS[uri];

  if (!content) {
    throw new Error(`资源不存在: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: uri.includes("skills") ? "application/json" : "text/markdown",
        text: content,
      },
    ],
  };
});

// ============================================
// 主函数
// ============================================

async function main() {
  console.error("========================================");
  console.error("🚀 HumanAgent MCP Server v1.0.0");
  console.error("   Let AI agents hire humans");
  console.error("========================================");
  console.error(`📡 Server URL: ${SERVER_URL}`);
  console.error(`🔧 Tools: ${ALL_TOOLS.length}`);
  console.error(`📚 Resources: ${RESOURCES.length}`);
  
  if (agentConfig) {
    console.error("----------------------------------------");
    console.error(`✅ Agent: ${agentConfig.name}`);
    console.error(`   ID: ${agentConfig.agent_id}`);
  } else {
    console.error("----------------------------------------");
    console.error("⚠️  未注册 Agent，请调用 register_agent");
  }
  
  console.error("========================================");

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("✅ MCP Server 已就绪");
}

main().catch(console.error);
