# Trace + Profile Demo

这个示例用于在本仓库内快速验证两件事：

- tracing 链路是否能正常生成并导出
- profiling 是否能采集并通过 `DatakitProfilingExporter` 发出

## 包含什么

- `app.js`
  一个最小 HTTP 服务，处理 `/work` 请求时会做三件事：
  - 制造一点 CPU 消耗
  - 分配一部分内存，方便 heap profile 采样
  - 调用下游 HTTP 服务，形成一条完整 trace
- `run-demo.js`
  一键启动 sender app，发压并触发 profile，然后把数据发送到 DataKit
- `mock-backend.js`
  可选的本地 mock receiver，只有在你想脱离 DataKit 自测时才需要

## 安装

如果你是在当前仓库里使用：

```bash
cd examples/trace-profile-demo
npm install
```

## 一键验证

```bash
npm run demo
```

默认发送到：

- trace: `http://127.0.0.1:4318/v1/traces`
- metric: `http://127.0.0.1:4318/v1/metrics`
- profile: `http://127.0.0.1:9529/profiling/v1/input`

终端里会打印实际使用的 exporter endpoint，并执行：

- 4 次 `/work` 请求
- 1 次 `/__collect-profile`

如果 DataKit 可达，trace / metric / profile 就会被发送出去。

## 单独运行 app

```bash
npm run app
```

你可以覆盖为真实后端：

```bash
TRACE_ENDPOINT=http://127.0.0.1:4318/v1/traces \
METRIC_ENDPOINT=http://127.0.0.1:4318/v1/metrics \
PROFILE_ENDPOINT=http://127.0.0.1:9529/profiling/v1/input \
npm run app
```

然后请求：

```bash
curl 'http://127.0.0.1:8080/work?cpuMs=200&allocMb=12&pauseMs=100'
curl 'http://127.0.0.1:8080/__collect-profile'
```

## 说明

- trace 侧使用官方 Node SDK、HTTP instrumentation 和 runtime-node instrumentation
- profile 侧直接依赖已发布的 `@cloudcare/profiler-nodejs`
- 默认模式下这个 demo 是纯发送方，不会监听 `9529`
- 这个 demo 的目标是验证“信号能不能发出来”，不是做最终生产配置
