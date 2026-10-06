# c2c-005 · 声音表情包工坊

Vue 3 + TypeScript + Vite 纯前端声音创作工具。支持最长 10 秒录音/导入、裁剪、声学特征情绪匹配、Canvas 封面、IndexedDB 本地作品集和系统文件分享。

## 架构

- `src/core`：作品模型、特征归一化、情绪规则与封面预设
- `src/ports`：录音、音频、Canvas、仓储与分享接口
- `src/adapters`：MediaRecorder、Web Audio、Canvas、IndexedDB、Web Share 实现
- `src/ui`：Vue 阶段式工作流和原生 CSS

## 运行

```bash
npm install
npm run dev
npm run build
docker compose up --build
```

本地开发默认由 Vite 提供；Docker 部署访问 `http://localhost:8105`。浏览器录音在非 localhost 环境通常需要 HTTPS 和麦克风权限。

声音只保存在本机 IndexedDB，不会上传。生成的分享链接仅承载标题、情绪和封面配置，不包含原始音频；文件分享不受此限制。情绪识别是娱乐性启发式结果，不代表身份、性格或医学判断。
