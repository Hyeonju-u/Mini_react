// VOC 서비스 API(/api/v1)를 부르는 클라이언트 (Step 4). 순수 함수 + fetch 한 곳.
// fetchFn은 테스트에서 바꿔 끼운다 (data.js의 loadDataset, status-api.js와 같은 방식).
// 모든 조회 함수는 { body, ms }를 돌려준다. body.dataSource("redis" | "dbms")는 서버가 어디서 읽었는지, ms는 응답이 오기까지 걸린 시간이다.
import { saveStatus as saveStatusRequest } from "./status-api.js";

/** 조회 실패. status가 0이면 서버에 닿지 못한 것이다 */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};
const reasonOf = (body) => (typeof body?.error === "string" ? ` ${body.error}` : "");

/** 조건을 쿼리 문자열로. "all"과 빈 값은 보내지 않는다 (서버의 기본값이 전체) */
export function toQuery(filters = {}, extra = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function createServiceApi(base = "api/v1", fetchFn = (...args) => fetch(...args)) {
  async function get(path) {
    const startedAt = performance.now();
    let response;
    try {
      response = await fetchFn(`${base}${path}`);
    } catch {
      throw new ApiError("서버에 연결하지 못했습니다. 네트워크 연결이나 서버 실행 여부를 확인해 주세요.", 0);
    }
    const body = await readJson(response);
    if (!response.ok) throw new ApiError(`데이터를 불러오지 못했습니다. (HTTP ${response.status})${reasonOf(body)}`, response.status);
    if (body === null) throw new ApiError("서버 응답이 올바른 JSON이 아닙니다.", response.status);
    return { body, ms: Math.round(performance.now() - startedAt) };
  }

  // 시연 제어: 서비스를 --demo-controls 로 켰을 때만 있다. 꺼져 있거나 닿지 못하면 enabled:false (화면에 버튼을 만들지 않는다)
  async function demoState() {
    try {
      const response = await fetchFn(`${base}/demo/dbms`);
      const body = await readJson(response);
      return response.ok && body ? body : { enabled: false };
    } catch {
      return { enabled: false };
    }
  }
  async function demoPost(action) {
    let response;
    try {
      // X-Demo-Control: 같은 사이트의 화면이 직접 보낸 요청임을 서버가 확인하는 표시 (다른 웹사이트는 이 헤더를 붙일 수 없다)
      response = await fetchFn(`${base}/demo/dbms/${action}`, { method: "POST", headers: { "X-Demo-Control": "1" } });
    } catch {
      throw new ApiError("서버에 연결하지 못했습니다.", 0);
    }
    const body = await readJson(response);
    if (!response.ok) throw new ApiError(typeof body?.error === "string" ? body.error : `요청이 실패했습니다. (HTTP ${response.status})`, response.status);
    return body;
  }

  /**
   * 시연용 비교: 화면이 처음 열릴 때처럼 요약과 신호 목록을 함께 받아 걸린 시간을 잰다.
   * cache "bypass"는 Redis를 거치지 않고 DBMS에서 계산한 것, "only"는 Redis에 있는 것만 (없으면 ApiError 404)
   */
  async function demoMeasure(cache) {
    const startedAt = performance.now();
    const [overview, list] = await Promise.all([get(`/overview?${toQuery({}, { cache })}`), get(`/alerts?${toQuery({}, { cache, pageSize: 1 })}`)]);
    return { source: list.body.dataSource, total: overview.body.total, signals: list.body.counts?.all ?? list.body.total ?? 0, ms: Math.round(performance.now() - startedAt) };
  }

  return {
    demo: { state: demoState, stop: () => demoPost("stop"), start: () => demoPost("start"), measure: demoMeasure },
    overview: (filters, { cache } = {}) => get(`/overview?${toQuery(filters, { cache })}`),
    alerts: (filters, { status, page, pageSize, cache } = {}) => get(`/alerts?${toQuery(filters, { status, page, pageSize, cache })}`),
    detail: (id, filters, evidencePage) => get(`/alerts/${encodeURIComponent(id)}?${toQuery(filters, { evidencePage })}`),
    history: (id) => get(`/alerts/${encodeURIComponent(id)}/status-history`),

    /**
     * 상태를 저장하고 확인을 기다린다. 저장되면 { status, at }. 실패는 SaveError (outcome: not_saved | unknown).
     * 저장 결과의 구분 규칙(요청 거절은 저장 안 됨, 서버 오류와 연결 끊김은 모름)은 status-api.js 한 곳에 있다.
     * 본문에 alertId가 같이 가지만 서비스는 주소의 ID만 쓴다.
     */
    saveStatus: (id, status) => saveStatusRequest(`${base}/alerts/${encodeURIComponent(id)}/status`, id, status, fetchFn),
  };
}
