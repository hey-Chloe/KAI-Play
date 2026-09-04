const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
type VlmLabel = 'A' | 'B' | 'C' | 'D';
const LABELS: readonly VlmLabel[] = ['A', 'B', 'C', 'D'];

export type VlmMode = 'disabled' | 'http';

export type VlmConfig = {
  mode: VlmMode;
  baseUrl: string | null;
  apiKey: string | null;
  timeoutMs: number;
};

type FarmPlotInput = {
  status: 'empty' | 'growing' | 'ready' | 'weed';
  cropId: 'wheat' | 'carrot' | 'strawberry' | null;
  wateredToday: boolean;
};

export type FarmVlmObservationInput = {
  imageDataUrl: string;
  rpc: {
    day: number;
    revision: number;
    actionsLeft: number;
    coins: number;
    xp: number;
    plots: FarmPlotInput[];
  };
};

export class VlmError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function integer(value: unknown, minimum: number, maximum: number, field: string) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new VlmError(400, 'VLM_INPUT_INVALID', `${field} 无效。`);
  }
  return Number(value);
}

export function vlmConfigFromEnvironment(environment: NodeJS.ProcessEnv = process.env): VlmConfig {
  const rawMode = environment.DOUJOY_VLM_MODE ?? 'disabled';
  if (!['disabled', 'http'].includes(rawMode)) throw new Error('DOUJOY_VLM_MODE_INVALID');
  const timeoutMs = Number(environment.DOUJOY_VLM_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error('DOUJOY_VLM_TIMEOUT_MS_INVALID');
  const rawUrl = environment.DOUJOY_VLM_URL?.trim() || '';
  if (rawMode === 'http' && !rawUrl) throw new Error('DOUJOY_VLM_URL_REQUIRED');
  let baseUrl: string | null = null;
  if (rawUrl) {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('DOUJOY_VLM_URL_PROTOCOL_INVALID');
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    parsed.search = '';
    parsed.hash = '';
    baseUrl = parsed.toString().replace(/\/$/, '');
  }
  return {
    mode: rawMode as VlmMode,
    baseUrl,
    apiKey: environment.DOUJOY_VLM_API_KEY?.trim() || null,
    timeoutMs,
  };
}

function validateInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new VlmError(400, 'VLM_INPUT_INVALID', 'VLM 观察请求必须是对象。');
  }
  const value = input as Record<string, unknown>;
  if (typeof value.imageDataUrl !== 'string') throw new VlmError(400, 'VLM_INPUT_INVALID', '缺少观察画面。');
  const image = value.imageDataUrl.match(IMAGE_DATA_URL);
  if (!image) throw new VlmError(400, 'VLM_IMAGE_INVALID', '观察画面必须是 PNG、JPEG 或 WebP。');
  const imageBytes = Buffer.from(image[2]!, 'base64');
  if (!imageBytes.length || imageBytes.length > 512 * 1024) {
    throw new VlmError(413, 'VLM_IMAGE_TOO_LARGE', '观察画面不得超过 512KB。');
  }
  if (!value.rpc || typeof value.rpc !== 'object' || Array.isArray(value.rpc)) {
    throw new VlmError(400, 'VLM_INPUT_INVALID', '缺少结构化农场状态。');
  }
  const rpc = value.rpc as Record<string, unknown>;
  if (!Array.isArray(rpc.plots) || rpc.plots.length !== 6) {
    throw new VlmError(400, 'VLM_INPUT_INVALID', '农场必须包含六块地。');
  }
  const plots = rpc.plots.map((plot, index) => {
    if (!plot || typeof plot !== 'object' || Array.isArray(plot)) {
      throw new VlmError(400, 'VLM_INPUT_INVALID', `第 ${index + 1} 块地状态无效。`);
    }
    const item = plot as Record<string, unknown>;
    if (!['empty', 'growing', 'ready', 'weed'].includes(String(item.status))) {
      throw new VlmError(400, 'VLM_INPUT_INVALID', `第 ${index + 1} 块地状态无效。`);
    }
    if (![null, 'wheat', 'carrot', 'strawberry'].includes(item.cropId as null | string)
      || typeof item.wateredToday !== 'boolean') {
      throw new VlmError(400, 'VLM_INPUT_INVALID', `第 ${index + 1} 块地作物信息无效。`);
    }
    return { status:item.status, cropId:item.cropId, wateredToday:item.wateredToday } as FarmPlotInput;
  });
  return {
    mimeType:image[1]!,
    imageBase64:image[2]!,
    rpc:{
      day:integer(rpc.day, 1, 9, '日期'),
      revision:integer(rpc.revision, 0, 10_000, '状态版本'),
      actionsLeft:integer(rpc.actionsLeft, 0, 5, '剩余行动'),
      coins:integer(rpc.coins, 0, 1_000_000, '金币'),
      xp:integer(rpc.xp, 0, 1_000_000, '经验'),
      plots,
    },
  };
}

const cropLabels: Record<string, string> = { wheat:'小麦', carrot:'胡萝卜', strawberry:'草莓' };
const statusLabels: Record<string, string> = { empty:'空地', growing:'成长中', ready:'成熟', weed:'杂草' };

function sceneSummary(rpc: ReturnType<typeof validateInput>['rpc'], override: Partial<typeof rpc> = {}) {
  const source = { ...rpc, ...override };
  const plotText = source.plots.map((plot, index) => {
    const crop = plot.cropId ? cropLabels[plot.cropId] : '';
    const water = plot.status === 'growing' && plot.wateredToday ? '已浇水' : '';
    return `${index + 1}号${crop}${statusLabels[plot.status]}${water}`;
  }).join('，');
  return `第${source.day}日，${source.coins}金币，${source.xp}经验，剩余${source.actionsLeft}次行动；${plotText}`;
}

function structuredFarmState(rpc: ReturnType<typeof validateInput>['rpc'], override: Partial<typeof rpc> = {}) {
  const source = { ...rpc, ...override };
  return {
    scene:'farm' as const,
    day:source.day,
    actionsLeft:source.actionsLeft,
    coins:source.coins,
    xp:source.xp,
    plots:source.plots.map((plot, index) => ({
      id:`plot-${index + 1}`,
      position:index,
      status:plot.status,
      cropId:plot.cropId,
      wateredToday:plot.wateredToday,
    })),
  };
}

export function buildFarmVisualQuestion(input: FarmVlmObservationInput) {
  const { rpc } = validateInput(input);
  const wrongPlots = rpc.plots.map((plot, index) => index === 0
    ? { status:plot.status === 'empty' ? 'weed' : 'empty', cropId:null, wateredToday:false } as FarmPlotInput
    : plot);
  const variants = [
    { text:sceneSummary(rpc), state:structuredFarmState(rpc) },
    { text:sceneSummary(rpc, { day:rpc.day === 9 ? 8 : rpc.day + 1 }), state:structuredFarmState(rpc, { day:rpc.day === 9 ? 8 : rpc.day + 1 }) },
    { text:sceneSummary(rpc, { coins:rpc.coins + 17 }), state:structuredFarmState(rpc, { coins:rpc.coins + 17 }) },
    { text:sceneSummary(rpc, { plots:wrongPlots }), state:structuredFarmState(rpc, { plots:wrongPlots }) },
  ];
  const offset = rpc.revision % LABELS.length;
  const candidates = LABELS.map((label, index) => ({ label, ...variants[(index - offset + LABELS.length) % LABELS.length]! }));
  return {
    question:'观察这张 KAI 农场画面。以下哪一项与画面中的日期、资源和六块地状态完全一致？只回答选项字母。',
    choices:candidates.map(({ label, text }) => ({ label, text })),
    candidates,
    expectedLabel:LABELS[offset]!,
    rpc,
  };
}

export class VlmService {
  private readonly config: VlmConfig;

  constructor(config: VlmConfig) {
    this.config = config;
  }

  private async request(path: string, init: RequestInit = {}) {
    if (this.config.mode !== 'http' || !this.config.baseUrl) {
      throw new VlmError(503, 'VLM_DISABLED', 'VLM 服务尚未启用，Agent 正在使用结构化状态。');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        signal:controller.signal,
        headers:{
          accept:'application/json',
          ...(init.body ? { 'content-type':'application/json' } : {}),
          ...(this.config.apiKey ? { authorization:`Bearer ${this.config.apiKey}` } : {}),
          ...init.headers,
        },
      });
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || !payload || payload.ok !== true) {
        throw new VlmError(503, 'VLM_UPSTREAM_ERROR', 'VLM 服务返回了无效响应。');
      }
      return payload;
    } catch (error) {
      if (error instanceof VlmError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new VlmError(504, 'VLM_TIMEOUT', 'VLM 推理超时，已保留结构化观察结果。');
      }
      throw new VlmError(503, 'VLM_UNAVAILABLE', 'VLM 服务当前不可用，已保留结构化观察结果。');
    } finally {
      clearTimeout(timer);
    }
  }

  async status() {
    if (this.config.mode === 'disabled') {
      return { enabled:false, ready:false, backend:'disabled', model:null, specialization:'ScienceQA LoRA（研究模式）' };
    }
    try {
      const payload = await this.request('/health');
      return {
        enabled:true,
        ready:payload.ready === true,
        backend:'http',
        model:typeof payload.model === 'string' ? payload.model : null,
        specialization:'ScienceQA LoRA（跨域观察实验）',
      };
    } catch (error) {
      return {
        enabled:true,
        ready:false,
        backend:'http',
        model:null,
        specialization:'ScienceQA LoRA（跨域观察实验）',
        error:error instanceof VlmError ? error.code : 'VLM_UNAVAILABLE',
      };
    }
  }

  async observe(input: FarmVlmObservationInput) {
    const validated = validateInput(input);
    const visualQuestion = buildFarmVisualQuestion(input);
    const startedAt = Date.now();
    const payload = await this.request('/v1/observe', {
      method:'POST',
      body:JSON.stringify({
        image:{ mimeType:validated.mimeType, base64:validated.imageBase64 },
        question:visualQuestion.question,
        choices:visualQuestion.choices,
      }),
    });
    const result = payload.result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new VlmError(503, 'VLM_UPSTREAM_ERROR', 'VLM 服务未返回观察结果。');
    }
    const value = result as Record<string, unknown>;
    const label = typeof value.label === 'string' ? value.label.toUpperCase() : '';
    if (!LABELS.includes(label as VlmLabel)) {
      throw new VlmError(502, 'VLM_OUTPUT_INVALID', 'VLM 没有返回可解析的选项。');
    }
    const selectedCandidate = visualQuestion.candidates.find((candidate) => candidate.label === label)!;
    const usage = value.usage && typeof value.usage === 'object' && !Array.isArray(value.usage)
      ? value.usage as Record<string, unknown> : {};
    const inputTokens = typeof usage.inputTokens === 'number' && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 ? usage.inputTokens : null;
    const outputTokens = typeof usage.outputTokens === 'number' && Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0 ? usage.outputTokens : null;
    return {
      matched:label === visualQuestion.expectedLabel,
      label,
      expectedLabel:visualQuestion.expectedLabel,
      summary:selectedCandidate.text,
      structuredObservation:{
        ...selectedCandidate.state,
        source:'vlm_multiple_choice' as const,
        frameRevision:visualQuestion.rpc.revision,
      },
      decision:label === visualQuestion.expectedLabel ? 'pass' : 'hold',
      rawText:typeof value.rawText === 'string' ? value.rawText.slice(0, 500) : label,
      model:typeof value.model === 'string' ? value.model : null,
      latencyMs:Number.isFinite(value.latencyMs) ? Number(value.latencyMs) : Date.now() - startedAt,
      checkpoint:typeof value.checkpoint === 'string' ? value.checkpoint : null,
      usage:{ inputTokens, outputTokens, totalTokens:inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null },
      domainWarning:'该 LoRA 在 ScienceQA 上训练；本结果只证明调用链和单帧一致性判断，不代表已具备游戏策略能力。',
    };
  }
}
