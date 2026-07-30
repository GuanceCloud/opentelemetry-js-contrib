# OpenTelemetry Node.js 接入观测云最佳实践

## 前言

这份最佳实践面向 Node.js 应用接入观测云的常见场景，目标是同时拿到：

- Trace
- Metric
- Profile

其中 Trace / Metric 走标准 OpenTelemetry 链路，Profile 走观测云扩展能力 `@cloudcare/profiler-nodejs`。

## 环境信息

- Node.js：`^18.19.0` 或 `>=20.6.0`
- DataKit：
  - Trace：`/otel/v1/traces`
  - Metric：`/otel/v1/metrics`
  - Profile：`/profiling/v1/input`
- 配套材料：可参考随文提供的 `guance-nodejs-demo` 示例工程

## 准备工作

在跑 demo 或接入业务应用前，先把 DataKit 侧两个采集器打开：

### 1. 开启 OpenTelemetry 采集器

进入 DataKit 安装目录：

```bash
cd /usr/local/datakit/conf.d/opentelemetry
cp opentelemetry.conf.sample opentelemetry.conf
```

确认 HTTP 接口已开启，至少包含：

```toml
[[inputs.opentelemetry]]

  [inputs.opentelemetry.http]
    trace_api = "/otel/v1/traces"
    metric_api = "/otel/v1/metrics"
```

### 2. 开启 Profile 采集器

进入 DataKit 安装目录：

```bash
cd /usr/local/datakit/conf.d/profile
cp profile.conf.sample profile.conf
```

确认 Profile 接口已开启：

```toml
[[inputs.profile]]
  endpoints = ["/profiling/v1/input"]
```

### 3. 重启 DataKit

```bash
datakit service -R
```

然后用下面命令确认采集器已生效：

```bash
datakit monitor
```

### 4. 如果应用不在 DataKit 本机

如果应用和 DataKit 不在同一台机器，除了端口可达，还要确认 DataKit 已允许外部访问这些接口：

- `/otel/v1/traces`
- `/otel/v1/metrics`
- `/profiling/v1/input`

## 实现目标

推荐先达成下面三个目标，再考虑细节优化：

1. 服务能稳定上报 Trace
2. 指标能周期性写入 DataKit
3. Profile 至少能稳定上报 `wall` 数据

## 推荐接入方案

### Trace / Metric

- 优先使用 OTLP HTTP 路径
- DataKit 地址统一用 `http://127.0.0.1:9529/otel`
- 代码里使用：
  - `@opentelemetry/exporter-trace-otlp-proto`
  - `@opentelemetry/exporter-metrics-otlp-proto`

### Profile

- 使用 `@cloudcare/profiler-nodejs`
- 默认先只开 `wall`
- 等链路稳定后，再评估是否打开 `heap`

原因很简单：`wall` 对当前链路更稳，验证成本最低，最适合作为第一阶段默认值。

## 推荐默认值

这几个值够用，而且已经过实际验证：

| 参数 | 推荐值 |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:9529/otel` |
| `PROFILE_ENDPOINT` | `http://127.0.0.1:9529/profiling/v1/input` |
| `PROFILE_TYPES` | `wall` |
| `METRIC_EXPORT_INTERVAL_MS` | `5000` |
| `PROFILE_INTERVAL_MS` | `15000` |
| `PROFILE_WALL_DURATION_MS` | `4000` |

## 实施步骤

1. 先确认 DataKit 三个入口都已开启
2. 先跑 Trace / Metric
3. 再叠加 Profile
4. Profile 默认先只开 `wall`
5. 最后再根据需要调采集周期和时长

不要一开始就同时改很多参数，否则问题不好定位。

## 验证方法

推荐直接跑 demo：

```bash
# 进入 guance-nodejs-demo 示例目录
npm install
OTEL_DIAG_LEVEL=DEBUG npm run demo
```

成功时重点看两类结果：

1. 业务请求响应里能看到 `traceId`
2. 日志里出现：

```text
Datakit profiling export succeeded for 1 profile(s)
```

## 常见坑

### 1. Trace / Metric exporter 选错

如果路径是 `/otel/v1/traces` 和 `/otel/v1/metrics`，当前这套接入里应使用 `otlp-proto` 对应 exporter。  
直接换成别的 exporter 实现，容易出现 `400 Bad Request`。

### 2. Profile 一开始就开 `heap`

不是不能开，而是不建议作为第一步默认值。  
更稳的方式是先用：

```text
PROFILE_TYPES=wall
```

等 `wall` 跑通后，再尝试：

```text
PROFILE_TYPES=wall,heap
```

### 3. 应用过早退出

如果服务还没等到一次指标导出或 profile 上报就退出，会造成“看起来代码没问题，但观测云里没数据”。  
所以 demo 里会主动等待一次周期性导出再退出。

## 一句话建议

先用最小配置跑通 `trace + metric + wall profile`，确认链路稳定后，再增加 `heap` 和更复杂的运行参数。
