# Guance Node.js Demo

这个示例用于实际验证 Node.js 应用将三类数据上报到观测云：

- Trace：通过 OTLP HTTP 发到 DataKit `/otel/v1/traces`
- Metric：通过 OTLP HTTP 发到 DataKit `/otel/v1/metrics`
- Profile：通过 `@cloudcare/profiler-nodejs` 发到 DataKit `/profiling/v1/input`

默认情况下，demo 只采集 `wall` profile，以提高和当前发布包的兼容性；如果你要同时采集 `heap`，可以自行覆盖 `PROFILE_TYPES=wall,heap`。

如果你还需要一份更精炼的接入建议，见：

- [BEST_PRACTICE.md](/home/liurui/code/opentelemetry-js-contrib/examples/guance-nodejs-demo/BEST_PRACTICE.md:1)

## 安装

```bash
cd examples/guance-nodejs-demo
npm install
```

## 一键运行

如果本机 DataKit 已经开启：

- `http://127.0.0.1:9529/otel/v1/traces`
- `http://127.0.0.1:9529/otel/v1/metrics`
- `http://127.0.0.1:9529/profiling/v1/input`

直接运行：

```bash
npm run demo
```

脚本会自动：

1. 启动一个本地 Node.js 服务
2. 连续请求 4 次 `/work`
3. 触发 1 次 `/__collect-profile`
4. 等待一次周期性指标导出
5. 优雅关闭服务

## 自定义端点

可以通过环境变量覆盖默认 DataKit 地址：

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:9529/otel \
PROFILE_ENDPOINT=http://127.0.0.1:9529/profiling/v1/input \
npm run demo
```

也可以分别覆盖 Trace / Metric：

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:9529/otel/v1/traces \
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://127.0.0.1:9529/otel/v1/metrics \
PROFILE_ENDPOINT=http://127.0.0.1:9529/profiling/v1/input \
npm run demo
```

## 重要环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OTEL_SERVICE_NAME` | `guance-nodejs-demo` | 服务名 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:9529/otel` | OTLP 基础地址 |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | 自动拼接 | Trace 上报地址 |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | 自动拼接 | Metric 上报地址 |
| `PROFILE_ENDPOINT` | `http://127.0.0.1:9529/profiling/v1/input` | Profile 上报地址 |
| `METRIC_EXPORT_INTERVAL_MS` | `5000` | 指标导出周期 |
| `PROFILE_TYPES` | `wall` | 采集的 profile 类型，支持 `wall` 或 `wall,heap` |
| `PROFILE_INTERVAL_MS` | `15000` | 周期性 profile 采集间隔 |
| `PROFILE_WALL_DURATION_MS` | `4000` | 单次 wall profile 时长 |
| `OTEL_DIAG_LEVEL` | `ERROR` | OTel 调试日志级别 |

## 手动运行服务

如果你只想启动服务，不跑自动压测脚本：

```bash
npm run app
```

启动后可访问：

- `GET /health`
- `GET /__summary`
- `GET /work?cpuMs=200&allocMb=12&pauseMs=80`
- `POST /__collect-profile`

## 说明

- `/work` 会制造 CPU 计算、保留一部分内存，并调用一次 `/downstream`，用于同时触发 trace、metric、profile 数据。
- 指标包含请求计数、请求耗时、分配字节数和当前并发数。
- profile 侧使用 `@cloudcare/profiler-nodejs`，这是观测云扩展能力，不是 OpenTelemetry 官方标准包。
