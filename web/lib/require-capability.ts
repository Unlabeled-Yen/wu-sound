import 'server-only';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { can, type Capability } from './acl';
import type { SessionUser } from './types';

/**
 * 頁面層級的權限守衛。取代過去每支 page 各自複製貼上的
 * `if (!session) redirect('/login'); if (session.role !== 'boss') redirect('/staff')`——
 * 財務/標案/使用者管理這三塊禁區改用能力表判斷(見 lib/acl.ts),
 * 不再是寫死的角色比對,員工被擋下時導回 /boss(而非 /staff,因為
 * 員工桌面版現在也活在 /boss/* 底下,見
 * docs/desktop-lock-and-staff-access-spec-v1.md §8)。
 */
export async function requirePageCapability(cap: Capability): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, cap)) redirect('/boss');
  return session;
}
