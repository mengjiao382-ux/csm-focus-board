import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FEISHU_API = "https://open.feishu.cn/open-apis";

const tables = {
  opportunities: { table: "tbl1onIGd2BgbI98", view: "vew4G8N51g" },
  newBusiness: { table: "tbl1QolqX0HQihJs", view: "vew19MdvsN" },
  visits: { table: "tbl5xARHVEpG6nbe", view: "vew4NbTXxL" },
  manualTasks: { table: "tbl1FY0CMOWECqP2", view: "vew4WX1PgY" },
  jointVisits: { table: "tblRsANXxJIjW3fe", view: "vewUrhvGT2" },
  teamFocus: { table: "tbl3HN4RcfIvSe1d", view: "vew2l9uptc" },
} as const;

type Fields = Record<string, unknown>;
type FeishuRecord = { record_id: string; fields: Fields };

function text(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("、");
  if (typeof value === "object") {
    const item = value as Record<string, unknown>;
    return text(item.name ?? item.text ?? item.value ?? item.link ?? "");
  }
  return "";
}

function number(value: unknown): number {
  const parsed = Number(text(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value: unknown): string {
  const raw = text(value);
  if (!raw) return "待安排";
  const numeric = Number(raw);
  const date = Number.isFinite(numeric) && numeric > 1_000_000_000
    ? new Date(numeric)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: date.getHours() || date.getMinutes() ? "2-digit" : undefined,
    minute: date.getHours() || date.getMinutes() ? "2-digit" : undefined,
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function priority(value: unknown): "high" | "medium" | "low" {
  const label = text(value);
  if (/高|紧急|P0|P1/i.test(label)) return "high";
  if (/低|P3/i.test(label)) return "low";
  return "medium";
}

function category(value: unknown): "opportunity" | "delivery" | "performance" | "other" {
  const label = text(value);
  if (label.includes("商机")) return "opportunity";
  if (label.includes("交付")) return "delivery";
  if (label.includes("绩效")) return "performance";
  return "other";
}

function isDone(value: unknown): boolean {
  return /已完成|完成|已关闭|done/i.test(text(value));
}

function isCurrentMonth(value: unknown): boolean {
  const raw = text(value);
  if (!raw) return true;
  const numeric = Number(raw);
  const parsed = Number.isFinite(numeric) && numeric > 1_000_000_000
    ? new Date(numeric)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    return raw.includes(`${now.getMonth() + 1}月`) || !/\d{1,2}月/.test(raw);
  }
  const now = new Date();
  return parsed.getFullYear() === now.getFullYear() && parsed.getMonth() === now.getMonth();
}

async function tenantToken(appId: string, appSecret: string): Promise<string> {
  const response = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    cache: "no-store",
  });
  const result = await response.json() as { code?: number; msg?: string; tenant_access_token?: string };
  if (!response.ok || result.code !== 0 || !result.tenant_access_token) {
    throw new Error(result.msg || `飞书鉴权失败（${response.status}）`);
  }
  return result.tenant_access_token;
}

async function records(token: string, baseToken: string, table: string, view: string): Promise<FeishuRecord[]> {
  const all: FeishuRecord[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${FEISHU_API}/bitable/v1/apps/${baseToken}/tables/${table}/records`);
    url.searchParams.set("view_id", view);
    url.searchParams.set("page_size", "500");
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = await response.json() as {
      code?: number;
      msg?: string;
      data?: { items?: FeishuRecord[]; has_more?: boolean; page_token?: string };
    };
    if (!response.ok || result.code !== 0) {
      throw new Error(result.msg || `读取数据表 ${table} 失败（${response.status}）`);
    }
    all.push(...(result.data?.items ?? []));
    pageToken = result.data?.has_more ? (result.data.page_token ?? "") : "";
  } while (pageToken);
  return all;
}

export async function GET() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const baseToken = process.env.FEISHU_BASE_TOKEN;

  if (!appId || !appSecret || !baseToken) {
    return NextResponse.json({ error: "飞书只读连接尚未配置" }, { status: 503 });
  }

  try {
    const token = await tenantToken(appId, appSecret);
    const entries = await Promise.all(
      Object.entries(tables).map(async ([key, config]) => [key, await records(token, baseToken, config.table, config.view)] as const),
    );
    const data = Object.fromEntries(entries) as Record<keyof typeof tables, FeishuRecord[]>;

    const opportunityTasks = data.opportunities.map(({ record_id, fields }) => ({
      id: `op-${record_id}`,
      title: text(fields["待办事项"]) || `跟进「${text(fields["商家"]) || "待确认商家"}」`,
      category: "opportunity" as const,
      priority: priority(fields["优先级"]),
      time: dateLabel(fields["截止时间"]),
      source: text(fields["来源"]) || "商机待办",
      detail: [text(fields["商家"]), text(fields["备注"])].filter(Boolean).join(" · "),
      member: text(fields["成员"]),
      done: isDone(fields["状态"]),
      readonly: true,
    }));

    const sharedTasks = data.manualTasks.map(({ record_id, fields }) => ({
      id: `manual-${record_id}`,
      title: text(fields["待办事项"]) || "未命名待办",
      category: category(fields["待办归类"]),
      priority: priority(fields["优先级"]),
      time: dateLabel(fields["截止时间"]),
      source: text(fields["来源"]) || "伙伴手动",
      detail: text(fields["备注"]),
      member: text(fields["成员"]),
      done: isDone(fields["状态"]),
      readonly: true,
    }));

    const newBusiness = data.newBusiness.reduce((total, { fields }) => ({
      inflow: total.inflow + number(fields["本月流入商家数"]),
      uploaded: total.uploaded + number(fields["盘点上传数"]),
      pendingUpload: total.pendingUpload + number(fields["盘点待上传数"]),
    }), { inflow: 0, uploaded: 0, pendingUpload: 0 });

    const visitMembers = data.visits.map(({ record_id, fields }, index) => {
      const faceTarget = number(fields["面访目标"]);
      const callbackTarget = number(fields["回访目标"]);
      const faceDone = number(fields["面访合格数"]);
      const callbackDone = number(fields["回访合格数"]);
      return {
        id: record_id,
        name: text(fields["成员"]) || `成员 ${index + 1}`,
        face: number(fields["面访剩余量"]),
        callback: number(fields["回访剩余数量"]),
        done: faceDone + callbackDone,
        total: faceTarget + callbackTarget,
      };
    });

    const joint = new Map<string, { name: string; details: string[]; count: number }>();
    for (const { fields } of data.jointVisits) {
      if (!isCurrentMonth(fields["拜访月份"] ?? fields["具体拜访时间（如有）"])) continue;
      const visitors = text(fields["拜访人"]).split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
      const companion = text(fields["同行人"]);
      const merchant = text(fields["商家名称"]);
      for (const visitor of visitors.length ? visitors : ["待确认成员"]) {
        const current = joint.get(visitor) ?? { name: visitor, details: [], count: 0 };
        current.count += 1;
        current.details.push([visitor, companion].filter(Boolean).join(" & ") + (merchant ? `（${merchant}）` : ""));
        joint.set(visitor, current);
      }
    }
    const maxJoint = Math.max(1, ...[...joint.values()].map((item) => item.count));
    const jointVisits = [...joint.values()].sort((a, b) => b.count - a.count).map((item) => ({
      name: item.name,
      detail: item.details.slice(0, 3).join("、"),
      count: item.count,
      width: Math.max(12, Math.round(item.count / maxJoint * 100)),
    }));

    const teamFocus = data.teamFocus
      .map(({ record_id, fields }) => ({
        id: record_id,
        title: text(fields["事项"]) || "未命名事项",
        owner: text(fields["负责人"]) || "待分配",
        deadline: dateLabel(fields["截止时间"]),
        status: text(fields["状态"]) || "进行中",
        order: number(fields["排序"]),
      }))
      .sort((a, b) => a.order - b.order);

    return NextResponse.json({
      source: "feishu",
      syncedAt: new Date().toISOString(),
      tasks: [...opportunityTasks, ...sharedTasks],
      newBusiness,
      visitMembers,
      jointVisits,
      teamFocus,
      counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length])),
    });
  } catch (error) {
    console.error("Feishu read-only sync failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "飞书读取失败" }, { status: 502 });
  }
}
