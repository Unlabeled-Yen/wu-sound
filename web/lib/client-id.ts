/**
 * 瀏覽器端產生一個夠隨機的 id,不能只叫 crypto.randomUUID()。
 *
 * 那支 API 屬於 Web Crypto,瀏覽器只在「安全情境」下開放——https 或
 * localhost。工地手機用 http://區網IP:port 連測試機(甚至日後某些內網
 * 部署情境)都不算安全情境,crypto.randomUUID 整個是 undefined,
 * 不是丟錯誤,是直接炸開 TypeError(2026-08-18 Yen 在真機上實測撞到)。
 *
 * 這裡只是拿來當本地識別碼(session id、離線佇列項目 id),不是安全用途,
 * 犯不著要求 CSPRNG——crypto.getRandomValues 在部分瀏覽器一樣受同一個
 * 安全情境限制,所以退路也不用它,單純用 Math.random 拼字串。
 */
export function randomClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}
