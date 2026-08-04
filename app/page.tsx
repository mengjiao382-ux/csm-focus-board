"use client";

import { useEffect, useMemo, useState } from "react";

type Category = "opportunity" | "delivery" | "performance" | "other";
type Priority = "high" | "medium" | "low";

type Task = {
  id: number | string;
  title: string;
  category: Category;
  priority: Priority;
  time: string;
  source: string;
  detail?: string;
  member?: string;
  done?: boolean;
  readonly?: boolean;
};

type VisitMember = { id?: string; name: string; face: number; callback: number; done: number; total: number; color?: string };
type JointVisit = { name: string; detail: string; count: number; width: number };
type TeamFocus = { id: string; title: string; owner: string; deadline: string; status: string; order: number };
type DashboardPayload = {
  source: "feishu";
  syncedAt: string;
  tasks: Task[];
  newBusiness: { inflow: number; uploaded: number; pendingUpload: number };
  visitMembers: VisitMember[];
  jointVisits: JointVisit[];
  teamFocus: TeamFocus[];
  counts: Record<string, number>;
};

const categories: Record<Category, { label: string; icon: string; color: string }> = {
  opportunity: { label: "商机待办", icon: "◎", color: "#6257e7" },
  delivery: { label: "交付待办", icon: "◫", color: "#0d9f78" },
  performance: { label: "绩效待办", icon: "↗", color: "#e58a26" },
  other: { label: "其他待办", icon: "◇", color: "#68738d" },
};

const seedTasks: Task[] = [
  { id: 1, title: "跟进「云间小馆」连锁拓店意向", category: "opportunity", priority: "high", time: "09:30", source: "拜访录音", detail: "确认预算、决策人和下一次方案沟通时间" },
  { id: 2, title: "确认「桃里烘焙」报价反馈", category: "opportunity", priority: "medium", time: "14:00", source: "拜访录音", detail: "客户重点关注年付折扣与增值服务包" },
  { id: 3, title: "完成「野岛咖啡」盘点资料上传", category: "delivery", priority: "high", time: "11:00", source: "新商流入", detail: "门店资料已收齐，待上传盘点结果" },
  { id: 4, title: "预约「山海面馆」首次面访", category: "performance", priority: "medium", time: "今日", source: "有效拜访", detail: "本周待面访客户，优先确认店长可用时间" },
  { id: 5, title: "回访「拾光茶社」方案使用情况", category: "performance", priority: "medium", time: "16:00", source: "有效拜访", detail: "收集一周使用反馈与问题清单" },
  { id: 6, title: "整理本周优秀案例并同步群内", category: "other", priority: "low", time: "17:30", source: "成员手动", detail: "总结连锁客户方案推进经验" },
];

const visitMembers = [
  { name: "小满", face: 2, callback: 1, done: 7, total: 10, color: "#6257e7" },
  { name: "千千", face: 1, callback: 2, done: 6, total: 9, color: "#1aa37a" },
  { name: "提莫", face: 3, callback: 1, done: 5, total: 9, color: "#e58a26" },
  { name: "安安", face: 1, callback: 2, done: 4, total: 7, color: "#3f83d8" },
];

const jointVisits = [
  { name: "千千", detail: "千千 & 提莫（点石）", count: 1, width: 34 },
  { name: "小满", detail: "小满 & 安安（桃里、野岛）", count: 2, width: 68 },
  { name: "提莫", detail: "提莫 & 北北（云间、山海）", count: 2, width: 68 },
];

const filterItems: Array<{ key: "all" | Category; label: string }> = [
  { key: "all", label: "全部" },
  { key: "opportunity", label: "商机" },
  { key: "delivery", label: "交付" },
  { key: "performance", label: "绩效" },
  { key: "other", label: "其他" },
];

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [members, setMembers] = useState<VisitMember[]>(visitMembers);
  const [jointVisitRows, setJointVisitRows] = useState<JointVisit[]>(jointVisits);
  const [teamFocusRows, setTeamFocusRows] = useState<TeamFocus[]>([]);
  const [newBusiness, setNewBusiness] = useState({ inflow: 14, uploaded: 10, pendingUpload: 4 });
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({ newBusiness: 14, jointVisits: 5, visits: 28 });
  const [syncState, setSyncState] = useState<"loading" | "live" | "sample" | "error">("loading");
  const [syncedAt, setSyncedAt] = useState("");
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [draggedId, setDraggedId] = useState<number | string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("csm-focus-tasks-v2");
    if (!saved) return;
    try {
      // Restoring persisted browser state intentionally happens after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTasks(JSON.parse(saved));
    } catch {
      window.localStorage.removeItem("csm-focus-tasks-v2");
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/csm-dashboard", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "同步失败");
        return result as DashboardPayload;
      })
      .then((result) => {
        if (!active) return;
        setTasks((current) => {
          const localOnly = current.filter((task) => !task.readonly && task.source === "成员手动");
          return [...result.tasks, ...localOnly];
        });
        if (result.visitMembers.length) setMembers(result.visitMembers);
        setJointVisitRows(result.jointVisits);
        setTeamFocusRows(result.teamFocus);
        setNewBusiness(result.newBusiness);
        setSourceCounts(result.counts);
        setSyncedAt(result.syncedAt);
        setSyncState("live");
      })
      .catch(() => { if (active) setSyncState("sample"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("csm-focus-tasks-v2", JSON.stringify(tasks));
  }, [tasks]);

  const visible = useMemo(
    () => tasks.filter((task) => (filter === "all" || task.category === filter) && (showDone || !task.done)),
    [tasks, filter, showDone],
  );
  const todayOpen = tasks.filter((task) => !task.done && task.time !== "明天").length;
  const highCount = tasks.filter((task) => !task.done && task.priority === "high").length;

  function toggleDone(id: number | string) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }

  function dropOn(targetId: number | string) {
    if (draggedId === null || draggedId === targetId) return;
    setTasks((current) => {
      const next = [...current];
      const from = next.findIndex((task) => task.id === draggedId);
      const to = next.findIndex((task) => task.id === targetId);
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedId(null);
    setNotice("排序已更新");
    window.setTimeout(() => setNotice(""), 1600);
  }

  function saveTask(form: FormData) {
    const title = String(form.get("title") || "").trim();
    if (!title) return;
    const next: Task = {
      id: editing?.id || Date.now(),
      title,
      category: form.get("category") as Category,
      priority: form.get("priority") as Priority,
      time: String(form.get("time") || "今日"),
      source: editing?.source || "成员手动",
      detail: String(form.get("detail") || ""),
      done: editing?.done || false,
    };
    setTasks((current) => editing?.id ? current.map((task) => (task.id === editing.id ? next : task)) : [next, ...current]);
    setEditing(null);
    setNotice(editing?.id ? "待办已保存" : "待办已添加");
    window.setTimeout(() => setNotice(""), 1600);
  }

  const visitDone = members.reduce((sum, member) => sum + member.done, 0);
  const visitTotal = members.reduce((sum, member) => sum + member.total, 0);
  const pendingFace = members.reduce((sum, member) => sum + member.face, 0);
  const pendingCallback = members.reduce((sum, member) => sum + member.callback, 0);
  const jointTotal = jointVisitRows.reduce((sum, row) => sum + row.count, 0);
  const manualOpen = tasks.filter((task) => !task.done && (task.source === "成员手动" || task.source === "伙伴手动")).length;
  const syncLabel = syncState === "live" ? "飞书实时数据" : syncState === "loading" ? "正在同步…" : "当前显示样例数据";
  const displayTime = syncedAt ? new Date(syncedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">✓</span><span>聚焦</span></div>
        <nav aria-label="主导航">
          <a className="nav-item active" href="#today"><span>▦</span>今日待办<span className="nav-badge">{todayOpen}</span></a>
          <a className="nav-item" href="#overview"><span>◉</span>工作总览</a>
          <p className="nav-label">数据模块</p>
          <a className="nav-item" href="#overview"><span className="purple-text">◎</span>商机待办</a>
          <a className="nav-item" href="#overview"><span className="green-text">↳</span>新商流入</a>
          <a className="nav-item" href="#visits"><span className="orange-text">↗</span>有效拜访</a>
          <a className="nav-item" href="#team"><span className="blue-text">◆</span>团队重点</a>
          <p className="nav-label">我的待办</p>
          {(Object.keys(categories) as Category[]).map((key) => (
            <button className="nav-item category-nav" key={key} onClick={() => setFilter(key)}>
              <span style={{ color: categories[key].color }}>{categories[key].icon}</span>{categories[key].label}
              <span className="nav-count">{tasks.filter((t) => t.category === key && !t.done).length}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">陈</div>
          <div><strong>陈小满</strong><span>华东区 · CSM</span></div>
          <button aria-label="更多设置">•••</button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="打开菜单">☰</button>
          <div className="crumb"><span>工作台</span><b>/</b><strong>CSM 每日聚焦</strong></div>
          <div className="top-actions">
            <span className={`sync-state ${syncState}`}><i />{syncLabel}</span>
            <label className="search"><span>⌕</span><input placeholder="搜索待办或客户…" /></label>
            <button className="primary small" onClick={() => setEditing({} as Task)}><span>＋</span>上传待办</button>
          </div>
        </header>

        <div className="page" id="today">
          <div className="welcome">
            <div>
              <p className="eyebrow">8月3日 · 星期一</p>
              <h1>早上好，小满 <span>👋</span></h1>
              <p>今天有 <strong>{todayOpen} 项待办</strong>，其中 <em>{highCount} 项需要优先处理</em>。数据已从业务表自动汇总。</p>
            </div>
            <div className="day-score">
              <div className="score-ring"><span>72<small>%</small></span></div>
              <div><strong>本月综合进度</strong><span>较时间进度领先 3%</span></div>
            </div>
          </div>

          <section className="metrics" id="overview">
            <article className="metric-card purple">
              <div className="metric-head"><span className="metric-icon">◎</span><span className="trend up">本周 +2</span></div>
              <p>待推进商机</p><h3>8 <small>个</small></h3><span>预计金额 ¥126,000</span>
            </article>
            <article className="metric-card green">
              <div className="metric-head"><span className="metric-icon">↳</span><span className="trend">本月自动同步</span></div>
              <p>本月新商流入</p><h3>{newBusiness.inflow} <small>家</small></h3>
              <div className="metric-split"><span>已完成盘点 <b>{newBusiness.uploaded}</b></span><span className="attention">待上传 <b>{newBusiness.pendingUpload}</b></span></div>
            </article>
            <article className="metric-card orange visit-summary">
              <div className="metric-head"><span className="metric-icon">↗</span><span className="trend warning">待处理 {pendingFace + pendingCallback}</span></div>
              <p>有效拜访</p><h3>{visitDone} <small>/ {visitTotal} 次</small></h3>
              <div className="visit-summary-line"><span>待面访 <b>{pendingFace}</b></span><span>待回访 <b>{pendingCallback}</b></span></div>
            </article>
            <article className="metric-card blue custom-summary">
              <div className="metric-head"><span className="metric-icon">＋</span><span className="trend up">成员自定义</span></div>
              <p>我的手动待办</p><h3>{manualOpen} <small>项</small></h3>
              <div className="category-dots"><span>商机</span><span>交付</span><span>绩效</span><span>其他</span></div>
            </article>
          </section>

          <section className="team-grid" id="team">
            <article className="team-card priorities-card">
              <div className="card-heading">
                <div><span className="card-kicker">团队重点</span><h2>本周重要事项</h2></div>
                <span className="permission-badge">▣ 主管维护</span>
              </div>
              <div className="priority-list">
                {(teamFocusRows.length ? teamFocusRows : [
                  { id: "sample-1", title: "点石项目完成二轮方案确认", owner: "千千", deadline: "今日", status: "今日推进", order: 1 },
                  { id: "sample-2", title: "4 家新流入商户完成盘点上传", owner: "提莫", deadline: "本周", status: "进行中", order: 2 },
                  { id: "sample-3", title: "华东区高意向商机集中复盘", owner: "小满", deadline: "周三", status: "待开始", order: 3 },
                ]).slice(0, 5).map((item, index) => (
                  <div key={item.id}><span className="priority-index">{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong><small>负责人：{item.owner}</small><b className="status ongoing">{item.status || item.deadline}</b></div>
                ))}
              </div>
              <p className="permission-note">成员仅查看；新增、编辑和排序由主管完成</p>
            </article>

            <article className="team-card joint-card">
              <div className="card-heading">
                <div><span className="card-kicker">同步数据</span><h2>本月已完成联合拜访</h2></div>
                <span className="total-badge">团队合计 {jointTotal} 家</span>
              </div>
              <div className="joint-list">
                {jointVisitRows.map((visit) => (
                  <div className="joint-row" key={visit.name}>
                    <span className="member-avatar">{visit.name.slice(0, 1)}</span>
                    <div><strong>{visit.name}</strong><small>{visit.detail}</small><i><b style={{ width: `${visit.width}%` }} /></i></div>
                    <em>{visit.count}<small> 家</small></em>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="workspace">
            <div className="task-panel">
              <div className="panel-title">
                <div><h2>我的待办</h2><span>{visible.length} 项显示中 · 自动待办与手动待办合并</span></div>
                <button className="sort-button">≡ &nbsp;智能排序⌄</button>
              </div>
              <div className="filters">
                {filterItems.map((item) => (
                  <button className={filter === item.key ? "active" : ""} key={item.key} onClick={() => setFilter(item.key)}>
                    {item.label}{item.key !== "all" && <span>{tasks.filter((t) => t.category === item.key && !t.done).length}</span>}
                  </button>
                ))}
                <button className="done-filter" onClick={() => setShowDone(!showDone)}>{showDone ? "隐藏已完成" : "查看已完成"}</button>
              </div>
              <div className="task-list">
                {visible.map((task) => (
                  <article className={`task-card ${task.priority} ${task.done ? "done" : ""}`} key={task.id} draggable onDragStart={() => setDraggedId(task.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(task.id)}>
                    <span className="drag-handle" aria-label="拖动排序">⠿</span>
                    <button className="check" aria-label={task.done ? "标记未完成" : "标记完成"} onClick={() => toggleDone(task.id)}>{task.done ? "✓" : ""}</button>
                    <div className="task-main">
                      <div className="task-line"><h3>{task.title}</h3><span className="category-pill" style={{ color: categories[task.category].color, background: `${categories[task.category].color}12` }}>{categories[task.category].icon} {categories[task.category].label.replace("待办", "")}</span></div>
                      <p>{task.detail}</p>
                      <div className="task-meta"><span className={task.time.includes(":") ? "time urgent" : "time"}>◷ {task.time}</span><span>◉ {task.source}</span></div>
                    </div>
                    <button className="more" aria-label="编辑待办" onClick={() => setEditing(task)}>•••</button>
                  </article>
                ))}
                {!visible.length && <div className="empty"><span>✓</span><h3>这一栏已经清空</h3><p>做得漂亮，去看看其他分类吧。</p></div>}
              </div>
              <button className="add-inline" onClick={() => setEditing({} as Task)}>＋ 上传一项自定义待办</button>
              <p className="drag-tip">手动待办可选择商机、交付、绩效或其他分类</p>
            </div>

            <aside className="right-rail" id="visits">
              <section className="visit-board">
                <div className="section-heading"><div><span>成员进度</span><h2>有效拜访待跟进</h2></div><small>本月</small></div>
                <div className="visit-legend"><span><i className="face-dot" />待面访</span><span><i className="callback-dot" />待回访</span></div>
                <div className="member-progress-list">
                  {members.map((member, index) => {
                    const memberColor = member.color || ["#6257e7", "#1aa37a", "#e58a26", "#3f83d8"][index % 4];
                    return (
                    <div className="member-progress" key={member.name}>
                      <div className="member-line"><span className="tiny-avatar" style={{ background: `${memberColor}18`, color: memberColor }}>{member.name.slice(0, 1)}</span><strong>{member.name}</strong><span>面访 <b>{member.face}</b></span><span>回访 <b>{member.callback}</b></span><em>{member.done}/{member.total}</em></div>
                      <div className="member-bar"><i style={{ width: `${member.total ? Math.round(member.done / member.total * 100) : 0}%`, background: memberColor }} /></div>
                    </div>
                  )})}
                </div>
              </section>
              <section className="source-card">
                <div className="source-head"><span>↻</span><div><strong>飞书多维表格只读汇总</strong><small>最近同步：{displayTime}</small></div><em>{syncState === "live" ? "正常" : "样例"}</em></div>
                <div className="source-row"><span>新商流入</span><b>{sourceCounts.newBusiness ?? 0} 条</b></div>
                <div className="source-row"><span>联合拜访（同步版）</span><b>{sourceCounts.jointVisits ?? 0} 条</b></div>
                <div className="source-row"><span>有效拜访</span><b>{sourceCounts.visits ?? 0} 条</b></div>
              </section>
              <section className="insight-card">
                <span className="spark">✦</span>
                <div><strong>今日建议</strong><p>优先处理 <b>2 项高优先级待办</b>，并完成 1 家盘点资料上传。</p></div>
              </section>
            </aside>
          </section>
        </div>
      </section>

      {editing && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <form className="modal" action={saveTask}>
            <div className="modal-head"><div><p>成员自定义</p><h2>{editing.id ? "编辑待办" : "上传一项待办"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div>
            <label>待办内容<input name="title" defaultValue={editing.title} placeholder="例如：回访商家确认使用情况" autoFocus /></label>
            <div className="form-grid">
              <label>分类<select name="category" defaultValue={editing.category || "other"}>{(Object.keys(categories) as Category[]).map((key) => <option value={key} key={key}>{categories[key].label}</option>)}</select></label>
              <label>优先级<select name="priority" defaultValue={editing.priority || "medium"}><option value="high">高优先级</option><option value="medium">中优先级</option><option value="low">低优先级</option></select></label>
            </div>
            <label>提醒时间<input name="time" defaultValue={editing.time || "今日 17:00"} placeholder="今日 17:00" /></label>
            <label>补充说明<textarea name="detail" defaultValue={editing.detail} placeholder="添加客户背景、下一步动作或注意事项…" rows={3} /></label>
            <div className="modal-actions">
              {editing.id && <button className="delete" type="button" onClick={() => { setTasks(tasks.filter((t) => t.id !== editing.id)); setEditing(null); }}>删除待办</button>}
              <span /><button className="cancel" type="button" onClick={() => setEditing(null)}>取消</button><button className="primary" type="submit">保存待办</button>
            </div>
          </form>
        </div>
      )}
      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </main>
  );
}
